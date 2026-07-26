/**
 * POST /api/admin/estado — la administradora confirma o rechaza una cita. Exige sesión.
 *
 * Body: { id, estado } con estado ∈ confirmada | rechazada | en_proceso
 * Al confirmar o rechazar se avisa a la clienta por correo (si el correo está configurado).
 */
import { list, get, put } from '@vercel/blob';
import { leerSesion } from '../../lib/auth.js';
import { enviarCorreo, correoCitaConfirmada, correoCitaRechazada } from '../../lib/email.js';
import { llamarServicio } from '../../lib/whatsapp.js';

/**
 * Aviso por WhatsApp a la clienta, en paralelo al correo.
 *
 * Muchas clientas escriben por WhatsApp y nunca abren el correo: si solo se les avisa por
 * mail, se quedan sin saber si su cita quedo confirmada. Si falla, no pasa nada mas: el
 * estado de la cita ya esta guardado.
 */
async function avisarPorWhatsapp(cita, estado) {
  const destino = String(cita.telefono || '').trim();
  if (!destino) return;

  const cuando = [cita.fecha, cita.hora].filter(Boolean).join(' a las ');
  const texto = estado === 'confirmada'
    ? `Hola${cita.nombre ? ' ' + String(cita.nombre).split(' ')[0] : ''}! Tu cita de ${cita.plan || 'belleza'}${cuando ? ` para el ${cuando}` : ''} quedo CONFIRMADA. Te esperamos en el estudio.`
    : `Hola${cita.nombre ? ' ' + String(cita.nombre).split(' ')[0] : ''}, lamentablemente no podemos tomar tu cita${cuando ? ` del ${cuando}` : ''}. Escribenos y buscamos otro horario que te sirva.`;

  try {
    await llamarServicio('notificar', { metodo: 'POST', cuerpo: { destino, texto } });
  } catch (err) {
    console.error('[estado] no se pudo avisar por WhatsApp:', err?.message || err);
  }
}

const PERMITIDOS = new Set(['en_proceso', 'confirmada', 'rechazada']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const sesion = leerSesion(req, process.env.SESSION_SECRET || '');
  if (!sesion) return res.status(401).json({ error: 'No autorizado' });

  const { id = '', estado = '' } = (req.body && typeof req.body === 'object') ? req.body : {};
  if (!id) return res.status(400).json({ error: 'Falta el id de la cita' });
  if (!PERMITIDOS.has(estado)) return res.status(400).json({ error: 'Estado no válido' });

  try {
    // El id va dentro del nombre del archivo, así que basta con localizarlo por ahí.
    const { blobs } = await list({ prefix: 'citas/', limit: 1000 });
    const encontrado = blobs.find((b) => b.pathname.includes(id));
    if (!encontrado) return res.status(404).json({ error: 'Cita no encontrada' });

    const actual = await get(encontrado.pathname, { access: 'private', useCache: false });
    if (!actual?.stream) return res.status(404).json({ error: 'Cita no encontrada' });
    const cita = await new Response(actual.stream).json();

    const anterior = cita.estado;
    cita.estado = estado;
    cita.historial = [...(cita.historial || []), { estado, en: new Date().toISOString() }];

    // Misma ruta = se sobrescribe. No hay carrera posible: solo la administradora escribe aquí.
    await put(encontrado.pathname, JSON.stringify(cita), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    // Solo se avisa cuando el estado CAMBIA de verdad, para no repetir correos.
    if (estado !== anterior && cita.correo) {
      const plantilla = estado === 'confirmada' ? correoCitaConfirmada
        : estado === 'rechazada' ? correoCitaRechazada
        : null;
      if (plantilla) {
        const { asunto, html } = plantilla(cita);
        await enviarCorreo({ para: cita.correo, asunto, html }).catch(() => false);
      }
    }

    // El aviso por WhatsApp va aparte del correo: no depende de que la clienta haya
    // dado un correo valido, solo de que tengamos su numero.
    if (estado !== anterior && estado !== 'en_proceso') {
      await avisarPorWhatsapp(cita, estado);
    }

    return res.status(200).json({ ok: true, estado });
  } catch (err) {
    console.error('[estado] no se pudo actualizar:', err);
    return res.status(500).json({ error: 'No se pudo actualizar la cita' });
  }
}

/**
 * POST /api/admin/estado — la administradora confirma o rechaza una cita. Exige sesión.
 *
 * Body: { id, estado } con estado ∈ confirmada | rechazada | en_proceso
 * Al confirmar o rechazar se avisa a la clienta por correo (si el correo está configurado).
 */
import { list, get, put } from '@vercel/blob';
import { leerSesion } from '../../lib/auth.js';
import { enviarCorreo, correoCitaConfirmada, correoCitaRechazada } from '../../lib/email.js';

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

    return res.status(200).json({ ok: true, estado });
  } catch (err) {
    console.error('[estado] no se pudo actualizar:', err);
    return res.status(500).json({ error: 'No se pudo actualizar la cita' });
  }
}

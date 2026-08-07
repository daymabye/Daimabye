/**
 * POST /api/admin/editar — corrige los datos de una cita ya guardada. Exige sesión.
 *
 * Body: { id, correo?, fechaISO?, hora24?, plan?, nombre?, telefono?, sector?, notas?,
 *         reenviarCorreo?, avisarPorWhatsapp? }
 *
 * Existe porque los datos que toma el bot vienen de una conversación, y una conversación se
 * malinterpreta: un correo mal oído, una hora que se dijo de dos formas. Sin esto la única
 * salida era rechazar la cita y rehacerla, perdiendo el historial.
 *
 * Cada cambio queda en el historial de la cita con quién y cuándo, para que se pueda
 * reconstruir qué pasó si una clienta reclama.
 */
import { buscarCitaPorId, actualizarCita } from '../../lib/db-citas.js';
import { leerSesion } from '../../lib/auth.js';
import { enviarCorreo, correoParaClienta } from '../../lib/email.js';
import { llamarServicio } from '../../lib/whatsapp.js';

const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Solo estos campos se pueden tocar: el estado tiene su propio endpoint y sus avisos. */
const EDITABLES = {
  nombre: (v) => (String(v).trim().length >= 2 ? String(v).trim().slice(0, 80) : null),
  correo: (v) => (CORREO_VALIDO.test(String(v).trim()) ? String(v).trim().slice(0, 120) : null),
  telefono: (v) => String(v).trim().slice(0, 30),
  plan: (v) => (String(v).trim() ? String(v).trim().slice(0, 60) : null),
  fechaISO: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v).trim()) ? String(v).trim() : null),
  hora24: (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v).trim()) ? String(v).trim() : null),
  sector: (v) => String(v).trim().slice(0, 80),
  notas: (v) => String(v).trim().slice(0, 500),
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** La fecha escrita se deriva de la ISO, nunca se teclea aparte: así no pueden discrepar. */
function fechaEnPalabras(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const sesion = leerSesion(req, process.env.SESSION_SECRET || '');
  if (!sesion) return res.status(401).json({ error: 'No autorizado' });

  const cuerpo = req.body && typeof req.body === 'object' ? req.body : {};
  const id = String(cuerpo.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Falta el id de la cita' });

  const cambios = {};
  const invalidos = [];
  for (const [campo, validar] of Object.entries(EDITABLES)) {
    if (cuerpo[campo] === undefined) continue;
    const limpio = validar(cuerpo[campo]);
    if (limpio === null) invalidos.push(campo);
    else cambios[campo] = limpio;
  }

  if (invalidos.length) {
    return res.status(400).json({ error: `Revisa estos campos: ${invalidos.join(', ')}` });
  }
  if (!Object.keys(cambios).length) {
    return res.status(400).json({ error: 'No hay nada que cambiar' });
  }

  try {
    const cita = await buscarCitaPorId(id);
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });

    // Solo se anota lo que de verdad cambia: repetir el mismo valor no ensucia el historial.
    const antes = {};
    for (const [k, v] of Object.entries(cambios)) {
      if (String(cita[k] ?? '') !== String(v)) antes[k] = cita[k] ?? '';
    }
    if (!Object.keys(antes).length) {
      return res.status(200).json({ ok: true, sinCambios: true, cita });
    }

    Object.assign(cita, cambios);
    if (cambios.fechaISO) cita.fecha = fechaEnPalabras(cambios.fechaISO) || cita.fecha;
    if (cambios.hora24) cita.hora = cambios.hora24;

    cita.historial = [
      ...(cita.historial || []),
      { estado: cita.estado, editado: antes, en: new Date().toISOString() },
    ];

    let correoEnviado = cita.correoEnviado ?? null;
    let correoMotivo = cita.correoMotivo || '';

    // Reenviar solo si lo piden: un correo repetido por cada retoque de una nota molesta.
    if (cuerpo.reenviarCorreo) {
      const plantilla = correoParaClienta(cita);
      const r = await enviarCorreo({ para: cita.correo, ...plantilla });
      correoEnviado = Boolean(r?.ok);
      correoMotivo = r?.ok ? '' : String(r?.motivo || 'no se pudo enviar');
      cita.correoEnviado = correoEnviado;
      cita.correoMotivo = correoMotivo;
    }

    await actualizarCita(id, {
      ...cambios,
      fecha: cita.fecha,
      hora: cita.hora,
      historial: cita.historial,
      correoEnviado,
      correoMotivo,
    });

    // El aviso por WhatsApp lo escribe este código con los datos ya guardados, no un modelo:
    // es lo único que garantiza que lo que lee la clienta es lo que hay en la agenda.
    let avisada = false;
    if (cuerpo.avisarPorWhatsapp && cita.telefono) {
      const cuando = [cita.fecha, cita.hora].filter(Boolean).join(' a las ');
      const nombre = String(cita.nombre || '').trim().split(/\s+/)[0];
      const texto =
        `Hola${nombre ? ' ' + nombre : ''}! Actualicé los datos de tu cita:\n\n` +
        `• ${cita.plan || 'Servicio'}\n` +
        `• ${cuando || 'Fecha por confirmar'}\n\n` +
        'Si algo no está bien, dímelo por aquí.';
      try {
        await llamarServicio('notificar', {
          metodo: 'POST',
          cuerpo: { destino: cita.telefono, texto },
        });
        avisada = true;
      } catch (err) {
        console.error('[editar] no se pudo avisar por WhatsApp:', err?.message || err);
      }
    }

    return res.status(200).json({ ok: true, cita, cambios: antes, correoEnviado, correoMotivo, avisada });
  } catch (err) {
    console.error('[editar] no se pudo editar la cita:', err);
    return res.status(500).json({ error: 'No se pudo guardar el cambio' });
  }
}

/**
 * GET /api/agenda — horarios ya ocupados, para que el bot de WhatsApp no agende encima.
 *
 * No la consume el navegador: la llama el servicio de WhatsApp del servidor, que se
 * identifica con el mismo token compartido que usa el panel. Sin ese token no responde.
 *
 * Solo salen las citas que de verdad ocupan el sitio: las rechazadas se ignoran.
 */
import { listarCitas } from '../lib/db-citas.js';

const DURACION_POR_DEFECTO = 60;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const esperado = process.env.WHATSAPP_API_TOKEN;
  const enviado = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!esperado || enviado !== esperado) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const citas = await listarCitas();

    // Una cita rechazada o pendiente de reprogramar ya no ocupa el sitio: su hueco vuelve
    // a estar libre para que otra clienta lo pueda tomar.
    const LIBERAN = new Set(['rechazada', 'reprogramar']);
    const ocupados = citas
      .filter((c) => !LIBERAN.has(c.estado || 'en_proceso'))
      .filter((c) => c.fechaISO && c.hora24)
      .map((c) => ({
        id: c.id,
        nombre: c.nombre,
        plan: c.plan || "",
        contacto: c.telefono || '',
        fecha: c.fechaISO,
        hora: c.hora24,
        duracion: Number(c.duracionMin) || DURACION_POR_DEFECTO,
        estado: c.estado || 'en_proceso',
        correo: c.correo || '',
      }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ocupados });
  } catch (err) {
    console.error('[agenda] no se pudo leer:', err);
    return res.status(500).json({ error: 'No se pudo leer la agenda' });
  }
}

/**
 * GET /api/agenda — horarios ya ocupados, para que el bot de WhatsApp no agende encima.
 *
 * No la consume el navegador: la llama el servicio de WhatsApp del servidor, que se
 * identifica con el mismo token compartido que usa el panel. Sin ese token no responde.
 *
 * Solo salen las citas que de verdad ocupan el sitio: las rechazadas se ignoran.
 */
import { list, get } from '@vercel/blob';

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
    const { blobs } = await list({ prefix: 'citas/', limit: 1000 });

    const citas = (
      await Promise.all(
        blobs.map(async (b) => {
          try {
            const r = await get(b.pathname, { access: 'private', useCache: false });
            if (!r?.stream) return null;
            return await new Response(r.stream).json();
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean);

    const ocupados = citas
      .filter((c) => (c.estado || 'en_proceso') !== 'rechazada')
      .filter((c) => c.fechaISO && c.hora24)
      .map((c) => ({
        id: c.id,
        nombre: c.nombre,
        fecha: c.fechaISO,
        hora: c.hora24,
        duracion: Number(c.duracionMin) || DURACION_POR_DEFECTO,
        estado: c.estado || 'en_proceso',
      }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ocupados });
  } catch (err) {
    console.error('[agenda] no se pudo leer:', err);
    return res.status(500).json({ error: 'No se pudo leer la agenda' });
  }
}

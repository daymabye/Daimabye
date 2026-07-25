/**
 * GET /api/admin/bookings — devuelve todas las citas. Exige sesión válida.
 *
 * Sin cookie firmada no se lee ni un dato: la respuesta es 401 antes de tocar el almacén.
 */
import { list, get } from '@vercel/blob';
import { leerSesion } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const sesion = leerSesion(req, process.env.SESSION_SECRET || '');
  if (!sesion) return res.status(401).json({ error: 'No autorizado' });

  try {
    const { blobs } = await list({ prefix: 'citas/', limit: 1000 });

    // Se leen en paralelo; una cita ilegible no debe tumbar el panel entero.
    const citas = (
      await Promise.all(
        blobs.map(async (b) => {
          try {
            const r = await get(b.pathname, { access: 'private' });
            if (!r?.stream) return null;
            return await new Response(r.stream).json();
          } catch (err) {
            console.error('[bookings] no se pudo leer', b.pathname, err);
            return null;
          }
        })
      )
    ).filter(Boolean);

    citas.sort((a, b) => String(b.creadaEn).localeCompare(String(a.creadaEn)));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ total: citas.length, citas });
  } catch (err) {
    console.error('[bookings] fallo al listar:', err);
    return res.status(500).json({ error: 'No se pudieron cargar las citas' });
  }
}

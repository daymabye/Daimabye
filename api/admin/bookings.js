/**
 * GET /api/admin/bookings — devuelve todas las citas. Exige sesión válida.
 *
 * Sin cookie firmada no se lee ni un dato: la respuesta es 401 antes de tocar el almacén.
 */
import { listarCitas } from '../../lib/db-citas.js';
import { leerSesion } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const sesion = leerSesion(req, process.env.SESSION_SECRET || '');
  if (!sesion) return res.status(401).json({ error: 'No autorizado' });

  try {
    const citas = await listarCitas();

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ total: citas.length, citas });
  } catch (err) {
    console.error('[bookings] fallo al listar:', err);
    return res.status(500).json({ error: 'No se pudieron cargar las citas' });
  }
}

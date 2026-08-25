import { leerSesion } from './auth.js';
import { listarServicios, guardarServicio, validarServicio } from '../lib/landing-catalog.js';

export default async function handler(req, res) {
  const session = leerSesion(req, process.env.SESSION_SECRET || '');
  try {
    if (req.method === 'GET') return res.status(200).json({ services: await listarServicios(Boolean(session)) });
    if (!session) return res.status(401).json({ error: 'No autorizado' });
    if (!['POST', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Método no permitido' });
    const clean = validarServicio(req.body || {});
    if (clean.error) return res.status(400).json({ error: clean.error });
    return res.status(req.method === 'POST' ? 201 : 200).json({ service: await guardarServicio({ ...clean, version: Number(req.body?.version) || 0 }) });
  } catch (error) {
    console.error('[landing-catalog]', error?.message || error);
    return res.status(500).json({ error: 'No se pudo cargar el catálogo' });
  }
}

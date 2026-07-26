/**
 * GET  /api/admin/whatsapp/estado — si el numero esta conectado y, si no, el codigo vigente.
 * POST /api/admin/whatsapp/estado — pide un codigo de emparejamiento nuevo.
 */
import { sinPermiso, reenviar } from '../../../lib/whatsapp.js';

export default async function handler(req, res) {
  if (sinPermiso(req, res)) return;

  if (req.method === 'GET') return reenviar(res, 'estado');

  if (req.method === 'POST') {
    const numero = String(req.body?.numero || '').trim();
    return reenviar(res, 'pair', { metodo: 'POST', cuerpo: numero ? { numero } : {} });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Método no permitido' });
}

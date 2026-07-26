/**
 * GET /api/admin/whatsapp/conversaciones — lista de chats, el mas reciente primero.
 */
import { sinPermiso, reenviar } from '../../../lib/whatsapp.js';

export default async function handler(req, res) {
  if (sinPermiso(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  return reenviar(res, 'conversaciones');
}

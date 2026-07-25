/** POST /api/admin/logout — cierra la sesión borrando la cookie. */
import { cookieBorrada } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  res.setHeader('Set-Cookie', cookieBorrada());
  return res.status(200).json({ ok: true });
}

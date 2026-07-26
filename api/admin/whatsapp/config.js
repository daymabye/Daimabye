/**
 * GET    /api/admin/whatsapp/config — precios, reglas, citas y estado del bot.
 * POST   /api/admin/whatsapp/config — cambia una cosa segun `accion`.
 * DELETE /api/admin/whatsapp/config?regla=ID — elimina una regla.
 */
import { sinPermiso, reenviar } from '../../../lib/whatsapp.js';

export default async function handler(req, res) {
  if (sinPermiso(req, res)) return;

  if (req.method === 'GET') return reenviar(res, 'config');

  if (req.method === 'POST') {
    const { accion } = req.body || {};

    if (accion === 'bot') {
      return reenviar(res, 'config/bot', {
        metodo: 'POST',
        cuerpo: { activo: Boolean(req.body?.activo) },
      });
    }

    if (accion === 'precio') {
      return reenviar(res, 'config/precio', {
        metodo: 'POST',
        cuerpo: { clave: req.body?.clave, precio: req.body?.precio },
      });
    }

    if (accion === 'regla') {
      return reenviar(res, 'config/regla', { metodo: 'POST', cuerpo: { texto: req.body?.texto } });
    }

    return res.status(400).json({ error: 'Acción no reconocida' });
  }

  if (req.method === 'DELETE') {
    const id = Number.parseInt(req.query?.regla, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Falta la regla' });
    return reenviar(res, `config/regla/${id}`, { metodo: 'DELETE' });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Método no permitido' });
}

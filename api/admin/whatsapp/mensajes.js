/**
 * GET  /api/admin/whatsapp/mensajes?jid=… — el hilo completo de una conversacion.
 * POST /api/admin/whatsapp/mensajes — envia un mensaje  { jid, texto }
 * PUT  /api/admin/whatsapp/mensajes — cambia quien atiende  { jid, modo: auto|manual }
 *
 * El identificador de un chat es su JID de WhatsApp (puede ser `...@lid`), asi que viaja
 * codificado: si se mandara crudo en la ruta, la arroba y los dos puntos la romperian.
 */
import { sinPermiso, reenviar } from '../../../lib/whatsapp.js';

export default async function handler(req, res) {
  if (sinPermiso(req, res)) return;

  const jid = String(req.method === 'GET' ? req.query?.jid || '' : req.body?.jid || '').trim();
  if (!jid) return res.status(400).json({ error: 'Falta la conversación' });
  const ruta = `conversaciones/${encodeURIComponent(jid)}`;

  if (req.method === 'GET') return reenviar(res, `${ruta}/mensajes`);

  if (req.method === 'POST') {
    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ error: 'Escribe un mensaje' });
    if (texto.length > 4000) return res.status(400).json({ error: 'El mensaje es demasiado largo' });
    return reenviar(res, `${ruta}/mensajes`, { metodo: 'POST', cuerpo: { texto } });
  }

  if (req.method === 'PUT') {
    const modo = req.body?.modo === 'manual' ? 'manual' : 'auto';
    return reenviar(res, `${ruta}/modo`, { metodo: 'POST', cuerpo: { modo } });
  }

  res.setHeader('Allow', 'GET, POST, PUT');
  return res.status(405).json({ error: 'Método no permitido' });
}

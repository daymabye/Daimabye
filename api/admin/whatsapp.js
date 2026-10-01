/**
 * /api/admin/whatsapp?tipo=... — todo el sub-panel de WhatsApp en un solo despachador.
 *
 * Eran cinco archivos (config, conversaciones, estado, ficha, mensajes), cada uno una
 * funcion serverless propia. El plan Hobby de Vercel tope a 12 funciones y el proyecto ya
 * estaba justo en el limite antes de agregar la tienda, asi que se fusionaron en uno: el
 * comportamiento de cada ruta es exactamente el mismo de antes, solo que ahora se elige
 * por `?tipo=` en vez de por archivo.
 */
import { sinPermiso, reenviar } from '../../lib/whatsapp.js';

/** GET /api/admin/whatsapp?tipo=config | POST (accion) | DELETE (regla) */
async function config(req, res) {
  if (req.method === 'GET') return reenviar(res, 'config');

  if (req.method === 'POST') {
    const { accion } = req.body || {};

    if (accion === 'bot') {
      return reenviar(res, 'config/bot', { metodo: 'POST', cuerpo: { activo: Boolean(req.body?.activo) } });
    }
    if (accion === 'precio') {
      return reenviar(res, 'config/precio', { metodo: 'POST', cuerpo: { clave: req.body?.clave, precio: req.body?.precio } });
    }
    if (accion === 'recordatorios') {
      return reenviar(res, 'config/recordatorios', { metodo: 'POST', cuerpo: { activo: Boolean(req.body?.activo) } });
    }
    if (accion === 'recordatoriosAhora') {
      return reenviar(res, 'config/recordatorios/ahora', { metodo: 'POST', cuerpo: {} });
    }
    if (accion === 'domicilio') {
      return reenviar(res, 'config/domicilio', { metodo: 'POST', cuerpo: { activo: Boolean(req.body?.activo) } });
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

/** GET /api/admin/whatsapp?tipo=conversaciones */
async function conversaciones(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  return reenviar(res, 'conversaciones');
}

/** GET /api/admin/whatsapp?tipo=estado | POST (pide codigo) */
async function estado(req, res) {
  if (req.method === 'GET') return reenviar(res, 'estado');

  if (req.method === 'POST') {
    const accion = req.body?.accion;
    if (accion === 'reconectar') {
      return reenviar(res, 'reconectar', { metodo: 'POST', cuerpo: {} });
    }
    const numero = String(req.body?.numero || '').trim();
    return reenviar(res, 'pair', { metodo: 'POST', cuerpo: numero ? { numero } : {} });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Método no permitido' });
}

/** GET /api/admin/whatsapp?tipo=ficha&jid=… */
async function ficha(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  const jid = String(req.query?.jid || '').trim();
  if (!jid) return res.status(400).json({ error: 'Falta la conversación' });
  const forzar = req.query?.forzar === '1' ? '?forzar=1' : '';
  return reenviar(res, `conversaciones/${encodeURIComponent(jid)}/ficha${forzar}`);
}

/** GET /api/admin/whatsapp?tipo=mensajes&jid=… | POST (texto) | PUT (modo) */
async function mensajes(req, res) {
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

const RUTAS = { config, conversaciones, estado, ficha, mensajes };

export default async function handler(req, res) {
  if (sinPermiso(req, res)) return;

  const tipo = String(req.query?.tipo || '');
  const fn = RUTAS[tipo];
  if (!fn) return res.status(400).json({ error: 'Falta o no se reconoce ?tipo=' });

  return fn(req, res);
}

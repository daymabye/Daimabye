/**
 * Puente hacia el servicio de WhatsApp que corre en el servidor.
 *
 * El navegador NUNCA habla con ese servicio: solo con estas funciones, que corren en
 * Vercel y añaden el token secreto. Asi el token no llega jamas al telefono de nadie.
 */
import { leerSesion } from './auth.js';

const BASE = process.env.WHATSAPP_API_URL;
const TOKEN = process.env.WHATSAPP_API_TOKEN;

/** Comprueba la sesion de la administradora. Devuelve true si respondio con un error. */
export function sinPermiso(req, res) {
  if (!leerSesion(req, process.env.SESSION_SECRET || '')) {
    res.status(401).json({ error: 'No autorizado' });
    return true;
  }
  if (!BASE || !TOKEN) {
    console.error('[whatsapp] faltan WHATSAPP_API_URL o WHATSAPP_API_TOKEN');
    res.status(503).json({ error: 'El servicio de WhatsApp no está configurado' });
    return true;
  }
  return false;
}

/**
 * Reenvia la peticion al servidor del bot.
 *
 * El timeout es corto a proposito: si el servidor no responde, es mejor decirlo rapido
 * que dejar el panel colgado esperando.
 */
export async function llamarServicio(ruta, { metodo = 'GET', cuerpo } = {}) {
  const resp = await fetch(`${BASE.replace(/\/$/, '')}/${ruta.replace(/^\//, '')}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    signal: AbortSignal.timeout(15000),
  });

  const texto = await resp.text();
  let datos;
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    datos = { error: texto.slice(0, 200) };
  }
  return { ok: resp.ok, estado: resp.status, datos };
}

/** Atajo para las rutas que solo reenvian y devuelven lo mismo. */
export async function reenviar(res, ruta, opciones) {
  try {
    const { ok, estado, datos } = await llamarServicio(ruta, opciones);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(ok ? 200 : estado).json(datos);
  } catch (err) {
    console.error('[whatsapp] no se pudo contactar el servicio:', err);
    return res.status(504).json({
      error: 'No se pudo contactar el servicio de WhatsApp. Puede estar apagado.',
    });
  }
}

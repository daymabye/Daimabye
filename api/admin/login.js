/**
 * POST /api/admin/login — inicia sesión de administradora.
 *
 * La comprobación ocurre AQUÍ, en el servidor. Por eso el panel es de verdad privado:
 * si la contraseña se validara en el navegador, cualquiera la vería en el código fuente.
 */
import { verificarClave, cookieDeSesion } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { correo = '', clave = '' } = (req.body && typeof req.body === 'object') ? req.body : {};
  const { ADMIN_EMAIL, ADMIN_PASSWORD_HASH, SESSION_SECRET } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD_HASH || !SESSION_SECRET) {
    console.error('[login] faltan variables de entorno de administración');
    return res.status(500).json({ error: 'El acceso no está configurado' });
  }

  const correoOk = String(correo).trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();
  const claveOk = verificarClave(clave, ADMIN_PASSWORD_HASH);

  // Retardo fijo: encarece probar contraseñas a lo bruto y evita que el tiempo de
  // respuesta delate si el fallo fue del correo o de la clave.
  await new Promise((r) => setTimeout(r, 400));

  if (!correoOk || !claveOk) {
    // Mensaje único a propósito: no se revela cuál de los dos datos falló.
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }

  res.setHeader('Set-Cookie', cookieDeSesion(ADMIN_EMAIL, SESSION_SECRET));
  return res.status(200).json({ ok: true, correo: ADMIN_EMAIL });
}

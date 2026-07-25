/**
 * Sesión de la administradora.
 *
 * Todo esto corre EN EL SERVIDOR. La contraseña nunca viaja al navegador ni vive en el código:
 * en las variables de entorno solo hay un hash scrypt con sal, del que no se puede volver atrás.
 */
import crypto from 'node:crypto';

const COOKIE = 'daima_admin';
const DURACION_SEG = 60 * 60 * 8; // 8 horas

/** Compara la contraseña con el hash guardado, en tiempo constante. */
export function verificarClave(textoPlano, guardado) {
  const [sal, clave] = String(guardado || '').split(':');
  if (!sal || !clave) return false;
  let esperado;
  try {
    esperado = Buffer.from(clave, 'hex');
  } catch {
    return false;
  }
  const derivado = crypto.scryptSync(String(textoPlano), sal, esperado.length);
  // timingSafeEqual exige la misma longitud; comparar con === filtraría información
  // por el tiempo de respuesta.
  return derivado.length === esperado.length && crypto.timingSafeEqual(derivado, esperado);
}

function firmar(valor, secreto) {
  return crypto.createHmac('sha256', String(secreto)).update(valor).digest('base64url');
}

/** Cookie de sesión firmada: HttpOnly (invisible para JavaScript) y Secure (solo HTTPS). */
export function cookieDeSesion(correo, secreto) {
  const datos = Buffer.from(
    JSON.stringify({ correo, exp: Date.now() + DURACION_SEG * 1000 })
  ).toString('base64url');
  const token = `${datos}.${firmar(datos, secreto)}`;
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${DURACION_SEG}`;
}

export function cookieBorrada() {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/** Devuelve la sesión si la cookie es auténtica y no ha caducado; si no, null. */
export function leerSesion(req, secreto) {
  const bruto = String(req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`));
  if (!bruto) return null;

  const [datos, firma] = bruto.slice(COOKIE.length + 1).split('.');
  if (!datos || !firma) return null;

  const esperada = firmar(datos, secreto);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const sesion = JSON.parse(Buffer.from(datos, 'base64url').toString());
    if (!sesion.exp || sesion.exp < Date.now()) return null;
    return sesion;
  } catch {
    return null;
  }
}

/**
 * Reemplazo de Vercel Blob para productos: filas en Postgres + fotos en Supabase Storage
 * (bucket público `productos-fotos`), en vez de un archivo JSON + blob público por producto.
 */
import { createClient } from '@supabase/supabase-js';

let _client = null;
function db() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    _client = createClient(url, key, { auth: { persistSession: false } });
  }
  return _client;
}

const LARGOS = { nombre: 80, descripcion: 500 };

export function validarProducto(cuerpo) {
  const nombre = String(cuerpo?.nombre || '').trim().slice(0, LARGOS.nombre);
  const descripcion = String(cuerpo?.descripcion || '').trim().slice(0, LARGOS.descripcion);
  const precio = Number.parseFloat(cuerpo?.precio);

  if (nombre.length < 2) return { error: 'Falta el nombre del producto' };
  if (!Number.isFinite(precio) || precio < 0) return { error: 'El precio no es válido' };

  return {
    nombre,
    descripcion,
    precio: Math.round(precio * 100) / 100,
    visible: cuerpo?.visible !== false,
  };
}

function toApp(row) {
  if (!row) return null;
  return {
    id: row.id,
    creadoEn: row.creado_en,
    nombre: row.nombre,
    descripcion: row.descripcion,
    precio: Number(row.precio),
    visible: row.visible,
    // `foto`, no `fotoUrl`: es el nombre de campo que ya usa api/productos.js.
    foto: row.foto_url,
  };
}

export async function listarProductos() {
  const { data, error } = await db().from('productos').select('*').order('creado_en', { ascending: false });
  if (error) throw error;
  return (data || []).map(toApp);
}

/**
 * Upsert por id: igual que el `put()` de Vercel Blob de antes, escribe la fila entera sin
 * importar si es alta o edición. api/productos.js SIEMPRE manda un id (lo genera con
 * crypto.randomUUID() antes de llamar aquí, incluso al crear), así que no hay forma de
 * distinguir "alta" de "edición" por la presencia del id - un upsert evita esa ambiguedad.
 */
export async function guardarProducto(producto) {
  const payload = {
    id: producto.id,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    precio: producto.precio,
    visible: producto.visible,
    foto_url: producto.foto ?? null,
  };
  if (producto.creadoEn) payload.creado_en = producto.creadoEn;

  const { data, error } = await db().from('productos').upsert(payload).select('*').single();
  if (error) throw error;
  return toApp(data);
}

export async function borrarProducto(id) {
  const { error } = await db().from('productos').delete().eq('id', id);
  if (error) throw error;
}

const TIPOS_IMAGEN = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES_IMAGEN = 4 * 1024 * 1024;

/**
 * Sube la foto de un producto al bucket público y devuelve su URL.
 *
 * Solo sube el archivo - NO toca la fila del producto en la base de datos. En el flujo de
 * api/productos.js la foto se sube ANTES de que la fila exista (alta) o antes de guardar
 * los demás cambios (edición); guardarProducto() es quien deja `producto.foto` en la fila,
 * después, con el resto de los datos.
 */
export async function subirFotoProducto(id, base64, mimetype) {
  const ext = TIPOS_IMAGEN[mimetype];
  if (!ext) return { error: 'La imagen debe ser JPG, PNG o WEBP' };

  let buffer;
  try {
    buffer = Buffer.from(String(base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
  } catch {
    return { error: 'No se pudo leer la imagen' };
  }
  if (!buffer.length) return { error: 'La imagen llegó vacía' };
  if (buffer.length > MAX_BYTES_IMAGEN) return { error: 'La imagen pesa demasiado (máximo 4MB)' };

  const path = `${id}.${ext}`;
  const { error: upErr } = await db().storage.from('productos-fotos').upload(path, buffer, {
    contentType: mimetype,
    upsert: true,
  });
  if (upErr) return { error: 'No se pudo subir la imagen: ' + upErr.message };

  const { data } = db().storage.from('productos-fotos').getPublicUrl(path);
  return { url: data.publicUrl };
}

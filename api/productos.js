/**
 * /api/productos — la tienda, en un solo endpoint.
 *
 * Va todo aquí junto y no en /api/admin/productos aparte porque el plan Hobby de Vercel
 * tope a 12 funciones serverless, y el proyecto ya estaba EXACTO en el límite antes de
 * este archivo. Separar lectura pública de gestión admin habría pedido dos funciones; así
 * solo hace falta una, distinguiendo por sesión.
 *
 * GET sin sesión  → la vitrina pública: solo los visibles, campos mínimos, sin caché
 *                    (`Cache-Control: no-store`) — eso es lo que hace que un producto
 *                    aparezca "en tiempo real" en la landing: no hay nada que lo retrase.
 * GET con sesión  → el catálogo completo del panel, incluidos los ocultos.
 * POST/PUT/DELETE → exigen sesión. Gestión de la tienda desde el panel de Daima.
 */
import crypto from 'node:crypto';
import { leerSesion } from '../lib/auth.js';
import { listarProductos, guardarProducto, borrarProducto, validarProducto, subirFotoProducto } from '../lib/productos.js';

export default async function handler(req, res) {
  const sesion = leerSesion(req, process.env.SESSION_SECRET || '');

  try {
    if (req.method === 'GET') {
      const productos = await listarProductos();
      res.setHeader('Cache-Control', 'no-store');

      if (sesion) return res.status(200).json({ productos });

      // Sin sesión: solo lo publicable, y solo lo que el público necesita ver.
      const publicos = productos
        .filter((p) => p.visible !== false)
        .map((p) => ({ id: p.id, nombre: p.nombre, descripcion: p.descripcion, precio: p.precio, foto: p.foto || null }));
      return res.status(200).json({ productos: publicos });
    }

    // Todo lo demás es gestión: exige sesión.
    if (!sesion) return res.status(401).json({ error: 'No autorizado' });

    if (req.method === 'POST') {
      const cuerpo = req.body && typeof req.body === 'object' ? req.body : {};
      const datos = validarProducto(cuerpo);
      if (datos.error) return res.status(400).json({ error: datos.error });

      const producto = { id: crypto.randomUUID(), creadoEn: new Date().toISOString(), foto: null, ...datos };

      if (cuerpo.fotoBase64 && cuerpo.fotoTipo) {
        const subida = await subirFotoProducto(producto.id, cuerpo.fotoBase64, cuerpo.fotoTipo);
        if (subida.error) return res.status(400).json({ error: subida.error });
        producto.foto = subida.url;
      }

      await guardarProducto(producto);
      return res.status(201).json({ producto });
    }

    if (req.method === 'PUT') {
      const cuerpo = req.body && typeof req.body === 'object' ? req.body : {};
      const id = String(cuerpo.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Falta el id del producto' });

      const actuales = await listarProductos();
      const existente = actuales.find((p) => p.id === id);
      if (!existente) return res.status(404).json({ error: 'Ese producto ya no existe' });

      const datos = validarProducto({ ...existente, ...cuerpo });
      if (datos.error) return res.status(400).json({ error: datos.error });

      const producto = { ...existente, ...datos };

      if (cuerpo.fotoBase64 && cuerpo.fotoTipo) {
        const subida = await subirFotoProducto(id, cuerpo.fotoBase64, cuerpo.fotoTipo);
        if (subida.error) return res.status(400).json({ error: subida.error });
        producto.foto = subida.url;
      }

      await guardarProducto(producto);
      return res.status(200).json({ producto });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query?.id || (req.body && req.body.id) || '').trim();
      if (!id) return res.status(400).json({ error: 'Falta el id del producto' });
      await borrarProducto(id);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[productos] fallo:', err);
    return res.status(500).json({ error: 'No se pudo completar la operación' });
  }
}

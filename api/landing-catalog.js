import { leerSesion } from '../lib/auth.js';
import { listarServicios, guardarServicio, validarServicio, seedServicios } from '../lib/landing-catalog.js';
import { obtenerCms, guardarCms, subirFotoLanding, FONT_OPTIONS, defaultCms, googleFontsHref } from '../lib/landing-cms.js';

function tokenInterno(req) {
  const esperado = process.env.WHATSAPP_API_TOKEN;
  const enviado = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return Boolean(esperado && enviado && enviado === esperado);
}

export default async function handler(req, res) {
  const session = leerSesion(req, process.env.SESSION_SECRET || '');
  try {
    if (req.method === 'GET' && req.query?.diagnostic === '1') {
      if (!session) return res.status(401).json({ error: 'No autorizado' });
      const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
      if (!configured) {
        return res.status(200).json({
          configured: false,
          tableAvailable: false,
          message: 'Catálogo sin configuración de Supabase.',
        });
      }
      try {
        await listarServicios(true);
        return res.status(200).json({ configured: true, tableAvailable: true });
      } catch {
        return res.status(200).json({
          configured: true,
          tableAvailable: false,
          message: 'La tabla landing_services no está disponible.',
        });
      }
    }

    if (req.method === 'GET' && (req.query?.cms === '1' || req.query?.cms === 'true')) {
      const { content, updatedAt, fromDb } = await obtenerCms();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        content,
        updatedAt,
        fromDb,
        fonts: FONT_OPTIONS,
        fontsHref: googleFontsHref(content),
      });
    }

    if (req.method === 'GET') {
      const services = await listarServicios(Boolean(session));
      if (req.query?.withCms === '1') {
        try {
          const { content, updatedAt, fromDb } = await obtenerCms();
          res.setHeader('Cache-Control', 'no-store');
          return res.status(200).json({
            services,
            content,
            updatedAt,
            fromDb,
            fontsHref: googleFontsHref(content),
          });
        } catch {
          return res.status(200).json({ services });
        }
      }
      return res.status(200).json({ services });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const autorizado = Boolean(session) || tokenInterno(req);
    if (!autorizado) return res.status(401).json({ error: 'No autorizado' });

    if (req.method === 'POST' && body.action === 'cms_get') {
      if (!session) return res.status(401).json({ error: 'No autorizado' });
      const { content, updatedAt, fromDb } = await obtenerCms();
      return res.status(200).json({ content, updatedAt, fromDb, fonts: FONT_OPTIONS, defaults: defaultCms() });
    }

    if (req.method === 'POST' && body.action === 'cms_save') {
      if (!session) return res.status(401).json({ error: 'No autorizado' });
      const saved = await guardarCms(body.content || body);
      return res.status(200).json({ ok: true, ...saved, fontsHref: googleFontsHref(saved.content) });
    }

    if (req.method === 'POST' && body.action === 'cms_upload') {
      if (!session) return res.status(401).json({ error: 'No autorizado' });
      const url = await subirFotoLanding(body.fotoBase64 || body.base64, body.fotoTipo || body.tipo);
      return res.status(200).json({ ok: true, url });
    }

    if (req.method === 'POST' && body.action === 'seed') {
      const list = Array.isArray(body.services) ? body.services : [];
      if (!list.length) return res.status(400).json({ error: 'Falta services[]' });
      const saved = await seedServicios(list);
      return res.status(200).json({ ok: true, count: saved.length, services: saved });
    }

    // Create/update individual service still requires admin session (not bot token).
    if (!session) return res.status(401).json({ error: 'No autorizado' });
    if (!['POST', 'PUT'].includes(req.method)) {
      return res.status(405).json({ error: 'Método no permitido' });
    }

    const clean = validarServicio(body);
    if (clean.error) return res.status(400).json({ error: clean.error });
    const service = await guardarServicio({
      ...clean,
      version: Number(body?.version) || 0,
    });
    return res.status(req.method === 'POST' ? 201 : 200).json({ service });
  } catch (error) {
    console.error('[landing-catalog]', error?.message || error);
    if (String(error?.message || error) === 'version_conflict') {
      return res.status(409).json({
        error: 'Alguien más editó este servicio. Recarga e intenta de nuevo.',
      });
    }
    return res.status(500).json({ error: 'No se pudo cargar el catálogo' });
  }
}

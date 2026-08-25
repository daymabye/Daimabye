import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

let client;
function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export const FONT_OPTIONS = [
  { id: 'Playfair Display', role: 'heading', stack: "'Playfair Display', Georgia, serif", google: 'Playfair+Display:wght@400;600' },
  { id: 'Cormorant Garamond', role: 'heading', stack: "'Cormorant Garamond', Georgia, serif", google: 'Cormorant+Garamond:wght@400;600' },
  { id: 'Lora', role: 'heading', stack: "'Lora', Georgia, serif", google: 'Lora:wght@400;600' },
  { id: 'Libre Baskerville', role: 'heading', stack: "'Libre Baskerville', Georgia, serif", google: 'Libre+Baskerville:wght@400;700' },
  { id: 'Inter', role: 'body', stack: "'Inter', system-ui, sans-serif", google: 'Inter:wght@400;500' },
  { id: 'Source Sans 3', role: 'body', stack: "'Source Sans 3', system-ui, sans-serif", google: 'Source+Sans+3:wght@400;600' },
  { id: 'DM Sans', role: 'body', stack: "'DM Sans', system-ui, sans-serif", google: 'DM+Sans:wght@400;500' },
  { id: 'Nunito Sans', role: 'body', stack: "'Nunito Sans', system-ui, sans-serif", google: 'Nunito+Sans:wght@400;600' },
  { id: 'Montserrat', role: 'body', stack: "'Montserrat', system-ui, sans-serif", google: 'Montserrat:wght@400;600' },
  { id: 'Outfit', role: 'body', stack: "'Outfit', system-ui, sans-serif", google: 'Outfit:wght@400;600' },
];

export function defaultCms() {
  return {
    version: 1,
    typography: { headingFont: 'Playfair Display', bodyFont: 'Inter', headingScale: 1, bodyScale: 1 },
    hero: {
      eyebrow: 'Portoviejo, Ecuador',
      title: 'Realza tu belleza natural',
      subtitle: 'Experta en maquillaje profesional, novias y peinados. Un look impecable, duradero y fotogenico para tus momentos mas importantes.',
      ctaPrimary: 'Reservar Ahora',
      ctaSecondary: 'Ver Portafolio',
      imageUrl: 'assets/opt/hero-1100.webp',
    },
    services: {
      eyebrow: 'Lo que ofrezco',
      title: 'Servicios Exclusivos',
      cards: [
        { title: 'Maquillaje Social / Eventos', body: 'Ideal para eventos, graduaciones y fiestas. Un look duradero que resalta tus mejores facciones con productos de alta gama y tecnicas avanzadas.' },
        { title: 'Novias', body: 'Diseno de imagen nupcial completo. Prueba de maquillaje y peinado para que brilles con luz propia, con acabado a prueba de lagrimas y fotos.' },
        { title: 'Peinados', body: 'Desde ondas glamorosas de Hollywood hasta recogidos elegantes y romanticos. El complemento perfecto para un maquillaje impecable.' },
      ],
    },
    pricing: { eyebrow: 'Inversion en ti', title: 'Planes y Paquetes' },
    store: { eyebrow: 'Para llevar a casa', title: 'Tienda' },
    gallery: { eyebrow: 'Inspiracion', title: 'Mi Portafolio' },
    about: {
      eyebrow: 'Conoceme',
      title: 'Hola, soy Daima',
      paragraphs: [
        'Con anos de experiencia en el mundo de la belleza, mi verdadera pasion es hacer que cada mujer se sienta segura, empoderada y hermosa frente al espejo.',
        'Me especializo en tecnicas modernas de maquillaje que realzan tu belleza natural en lugar de disfrazarla. Mi enfoque es crear pieles luminosas, miradas impactantes y peinados que duren toda la noche.',
        'Utilizo productos de la mas alta calidad para garantizar un acabado perfecto y a prueba de fotos. Estare encantada de atenderte y crear el look de tus suenos en mi estudio en Portoviejo!',
      ],
      imageUrl: 'assets/opt/story-1100.webp',
    },
    nav: { ctaLabel: 'Agendar Cita' },
  };
}

function clampScale(n, fallback = 1) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1.25, Math.max(0.85, Math.round(v * 100) / 100));
}

function fontId(id) {
  return FONT_OPTIONS.some((f) => f.id === id) ? id : null;
}

export function validarCms(input) {
  const base = defaultCms();
  const src = input && typeof input === 'object' ? input : {};
  const typ = src.typography || {};
  const hero = src.hero || {};
  const services = src.services || {};
  const pricing = src.pricing || {};
  const store = src.store || {};
  const gallery = src.gallery || {};
  const about = src.about || {};
  const nav = src.nav || {};
  const cardsIn = Array.isArray(services.cards) ? services.cards : base.services.cards;
  const cards = cardsIn.slice(0, 6).map((c, i) => ({
    title: String(c?.title ?? base.services.cards[i]?.title ?? '').trim().slice(0, 80),
    body: String(c?.body ?? base.services.cards[i]?.body ?? '').trim().slice(0, 400),
  }));
  while (cards.length < 3) cards.push({ title: '', body: '' });
  const parasIn = Array.isArray(about.paragraphs) ? about.paragraphs : base.about.paragraphs;
  const paragraphs = parasIn.slice(0, 5).map((p) => String(p || '').trim().slice(0, 600)).filter(Boolean);
  if (!paragraphs.length) paragraphs.push(...base.about.paragraphs);
  return {
    version: 1,
    typography: {
      headingFont: fontId(typ.headingFont) || base.typography.headingFont,
      bodyFont: fontId(typ.bodyFont) || base.typography.bodyFont,
      headingScale: clampScale(typ.headingScale, 1),
      bodyScale: clampScale(typ.bodyScale, 1),
    },
    hero: {
      eyebrow: String(hero.eyebrow ?? base.hero.eyebrow).trim().slice(0, 80),
      title: String(hero.title ?? base.hero.title).trim().slice(0, 120),
      subtitle: String(hero.subtitle ?? base.hero.subtitle).trim().slice(0, 400),
      ctaPrimary: String(hero.ctaPrimary ?? base.hero.ctaPrimary).trim().slice(0, 40),
      ctaSecondary: String(hero.ctaSecondary ?? base.hero.ctaSecondary).trim().slice(0, 40),
      imageUrl: String(hero.imageUrl ?? base.hero.imageUrl).trim().slice(0, 500),
    },
    services: {
      eyebrow: String(services.eyebrow ?? base.services.eyebrow).trim().slice(0, 80),
      title: String(services.title ?? base.services.title).trim().slice(0, 120),
      cards,
    },
    pricing: {
      eyebrow: String(pricing.eyebrow ?? base.pricing.eyebrow).trim().slice(0, 80),
      title: String(pricing.title ?? base.pricing.title).trim().slice(0, 120),
    },
    store: {
      eyebrow: String(store.eyebrow ?? base.store.eyebrow).trim().slice(0, 80),
      title: String(store.title ?? base.store.title).trim().slice(0, 120),
    },
    gallery: {
      eyebrow: String(gallery.eyebrow ?? base.gallery.eyebrow).trim().slice(0, 80),
      title: String(gallery.title ?? base.gallery.title).trim().slice(0, 120),
    },
    about: {
      eyebrow: String(about.eyebrow ?? base.about.eyebrow).trim().slice(0, 80),
      title: String(about.title ?? base.about.title).trim().slice(0, 120),
      paragraphs,
      imageUrl: String(about.imageUrl ?? base.about.imageUrl).trim().slice(0, 500),
    },
    nav: { ctaLabel: String(nav.ctaLabel ?? base.nav.ctaLabel).trim().slice(0, 40) },
  };
}

async function leerCmsStorage() {
  const { data, error } = await db().storage.from('productos-fotos').download('landing/cms.json');
  if (error || !data) return null;
  const text = await data.text();
  return JSON.parse(text);
}

async function escribirCmsStorage(content) {
  const body = Buffer.from(JSON.stringify({ content, updated_at: new Date().toISOString() }), 'utf8');
  const { error } = await db().storage.from('productos-fotos').upload('landing/cms.json', body, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw error;
}

export async function obtenerCms() {
  // Prefer table if it exists; otherwise JSON in Storage (no DDL required).
  try {
    const { data, error } = await db().from('landing_cms').select('content, updated_at').eq('id', 'default').maybeSingle();
    if (!error) {
      if (!data?.content || (typeof data.content === 'object' && !Object.keys(data.content).length)) {
        // empty row — try storage
      } else {
        return { content: validarCms(data.content), updatedAt: data.updated_at || null, fromDb: true };
      }
    }
  } catch (_) {}
  try {
    const stored = await leerCmsStorage();
    if (stored?.content) {
      return { content: validarCms(stored.content), updatedAt: stored.updated_at || null, fromDb: true };
    }
  } catch (_) {}
  return { content: defaultCms(), updatedAt: null, fromDb: false };
}

export async function guardarCms(content) {
  const clean = validarCms(content);
  const updatedAt = new Date().toISOString();
  try {
    const { data, error } = await db()
      .from('landing_cms')
      .upsert({ id: 'default', content: clean, updated_at: updatedAt })
      .select('content, updated_at')
      .single();
    if (!error && data) {
      try { await escribirCmsStorage(clean); } catch (_) {}
      return { content: validarCms(data.content), updatedAt: data.updated_at };
    }
  } catch (_) {}
  await escribirCmsStorage(clean);
  return { content: clean, updatedAt };
}

export async function subirFotoLanding(base64, tipo) {
  let buffer;
  try {
    buffer = Buffer.from(String(base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
  } catch {
    throw new Error('Imagen invalida');
  }
  if (!buffer.length || buffer.length > 4.5 * 1024 * 1024) throw new Error('La imagen debe pesar menos de 4.5 MB');
  const mime = String(tipo || 'image/jpeg').split(';')[0].trim();
  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mime)) throw new Error('Usa JPG, PNG o WebP');
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const path = 'landing/' + Date.now() + '-' + crypto.randomUUID().slice(0, 8) + '.' + ext;
  const buckets = ['landing-media', 'productos-fotos'];
  let lastErr = null;
  for (const bucket of buckets) {
    const { error: upErr } = await db().storage.from(bucket).upload(path, buffer, { contentType: mime, upsert: true });
    if (!upErr) {
      const { data } = db().storage.from(bucket).getPublicUrl(path);
      return data.publicUrl;
    }
    lastErr = upErr;
  }
  throw new Error(lastErr?.message || 'No se pudo subir la imagen');
}

export function googleFontsHref(content) {
  const c = validarCms(content);
  const families = [];
  for (const id of [c.typography.headingFont, c.typography.bodyFont]) {
    const f = FONT_OPTIONS.find((x) => x.id === id);
    if (f && !families.includes(f.google)) families.push(f.google);
  }
  if (!families.length) return null;
  return 'https://fonts.googleapis.com/css2?' + families.map((f) => 'family=' + f).join('&') + '&display=swap';
}
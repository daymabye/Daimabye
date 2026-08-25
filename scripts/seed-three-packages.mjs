import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

function loadEnv(path) {
  const out = {};
  for (const line of fs.readFileSync(path, 'utf8').split(/\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = loadEnv('/tmp/daima.prod.env');
const url = env.SUPABASE_URL || process.env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !/^https?:\/\//i.test(url)) {
  console.error('bad supabase url', Boolean(url), Boolean(key));
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const PACKS = [
  {
    key: 'social',
    name: 'Look Social Completo',
    description: 'Maquillaje social profesional de punta a punta\nPestañas a elección incluidas\nTécnica Halo o Foxy Eyes\nSellado de alta duración\nAcabado fotogénico listo para eventos',
    price: 25,
    duration_minutes: 120,
    display_order: 1,
    visible: true,
  },
  {
    key: 'combo_consentidor',
    name: 'Combo Consentidor',
    description: 'Maquillaje social profesional completo\nPeinado en ondas sueltas\nPestañas a elección\nSellado de larga duración\nIdeal para eventos y salidas especiales',
    price: 35,
    duration_minutes: 150,
    display_order: 2,
    visible: true,
  },
  {
    key: 'combo_pasarela',
    name: 'Combo Pasarela',
    description: 'Maquillaje con técnica a elección\nPeinado ondas de reina / de agua\nPestañas a elección\nLook de impacto garantizado\nDuración extendida para toda la noche',
    price: 45,
    duration_minutes: 150,
    display_order: 3,
    visible: true,
  },
];
const KEEP = new Set(PACKS.map((p) => p.key));
const { data: all, error: listErr } = await db.from('landing_services').select('key, version');
if (listErr) throw listErr;
for (const row of all || []) {
  if (KEEP.has(row.key)) continue;
  const { error } = await db.from('landing_services').update({ visible: false, version: Number(row.version || 0) + 1 }).eq('key', row.key);
  if (error) throw error;
  console.log('hid', row.key);
}
for (const pack of PACKS) {
  const current = (all || []).find((r) => r.key === pack.key);
  const version = current ? Number(current.version || 0) + 1 : 1;
  const { error } = await db.from('landing_services').upsert({ ...pack, version });
  if (error) throw error;
  console.log('upsert', pack.key, pack.price);
}
const { data: visible } = await db.from('landing_services').select('key,name,price,visible,display_order').eq('visible', true).order('display_order');
console.log('VISIBLE', JSON.stringify(visible, null, 2));
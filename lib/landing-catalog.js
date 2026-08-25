import { createClient } from '@supabase/supabase-js';

let client;
function db() {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltan variables de Supabase');
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return client;
}

export async function listarServicios(includeHidden = false) {
  let q = db()
    .from('landing_services')
    .select('key,name,description,price,duration_minutes,display_order,visible,version')
    .order('display_order')
    .order('key');
  if (!includeHidden) q = q.eq('visible', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export function validarServicio(input) {
  const key = String(input?.key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_');
  const name = String(input?.name || '').trim().slice(0, 120);
  const description = String(input?.description || '').trim().slice(0, 500);
  const price = Number(input?.price);
  const duration_minutes = Number(input?.duration_minutes);
  const display_order = Number.isFinite(Number(input?.display_order))
    ? Math.trunc(Number(input.display_order))
    : 0;
  if (!/^[a-z0-9][a-z0-9_]{1,79}$/.test(key)) return { error: 'Clave inválida' };
  if (name.length < 2) return { error: 'Nombre inválido' };
  if (!Number.isFinite(price) || price < 0) return { error: 'Precio inválido' };
  if (!Number.isInteger(duration_minutes) || duration_minutes < 1 || duration_minutes > 1440) {
    return { error: 'Duración inválida' };
  }
  return {
    key,
    name,
    description,
    price: Math.round(price * 100) / 100,
    duration_minutes,
    display_order,
    visible: input?.visible !== false,
  };
}

export async function guardarServicio(service) {
  const { data: current, error: readError } = await db()
    .from('landing_services')
    .select('version')
    .eq('key', service.key)
    .maybeSingle();
  if (readError) throw readError;
  if (current && Number(service.version || 0) !== Number(current.version)) {
    throw new Error('version_conflict');
  }
  const { data, error } = await db()
    .from('landing_services')
    .upsert(
      {
        ...service,
        updated_at: new Date().toISOString(),
        version: Number(service.version || 0) + 1,
      },
      { onConflict: 'key' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Seed/upsert without optimistic-lock conflicts (admin import from bot). */
export async function seedServicios(services) {
  const saved = [];
  for (const raw of services) {
    const clean = validarServicio(raw);
    if (clean.error) throw new Error(`${raw?.key || '?'}: ${clean.error}`);
    const { data: current, error: readError } = await db()
      .from('landing_services')
      .select('version')
      .eq('key', clean.key)
      .maybeSingle();
    if (readError) throw readError;
    const version = current ? Number(current.version) + 1 : 1;
    const { data, error } = await db()
      .from('landing_services')
      .upsert(
        {
          ...clean,
          version,
          updated_at: new Date().toISOString(),
          updated_by: 'seed',
        },
        { onConflict: 'key' }
      )
      .select('*')
      .single();
    if (error) throw error;
    saved.push(data);
  }
  return saved;
}

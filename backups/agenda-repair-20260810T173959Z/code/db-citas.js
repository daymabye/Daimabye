/**
 * Reemplazo de Vercel Blob para citas: ahora viven como filas reales en Postgres
 * (Supabase), no como un archivo JSON por cita.
 *
 * Por qué el cambio: Vercel Blob suspendió el store del proyecto (BlobStoreSuspendedError,
 * límite gratuito superado) y las citas dejaron de guardarse/leerse/mandar correo.
 *
 * Bonus real de este cambio: buscar una cita por id ahora es un WHERE id = $1 exacto, no
 * un `pathname.includes(id)` por substring (ese patrón viejo podía, en teoría, hacer match
 * con el archivo equivocado si un id fuera substring de otro).
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

function toApp(row) {
  if (!row) return null;
  return {
    id: row.id,
    creadaEn: row.creada_en,
    nombre: row.nombre,
    correo: row.correo,
    telefono: row.telefono,
    instagram: row.instagram,
    plan: row.plan,
    fecha: row.fecha,
    hora: row.hora,
    fechaISO: row.fecha_iso,
    hora24: row.hora24,
    duracionMin: row.duracion_min,
    sector: row.sector,
    estado: row.estado,
    historial: row.historial || [],
    notas: row.notas,
    origen: row.origen,
    dispositivo: row.dispositivo,
    navegador: row.navegador,
    llegoDesde: row.llego_desde,
    correoEnviado: row.correo_enviado,
    correoMotivo: row.correo_motivo,
  };
}

function toDb(c) {
  const out = {};
  const map = {
    nombre: 'nombre', correo: 'correo', telefono: 'telefono', instagram: 'instagram',
    plan: 'plan', fecha: 'fecha', hora: 'hora', hora24: 'hora24', sector: 'sector',
    estado: 'estado', historial: 'historial', notas: 'notas', origen: 'origen',
    dispositivo: 'dispositivo', navegador: 'navegador',
  };
  for (const [appKey, dbKey] of Object.entries(map)) {
    if (c[appKey] !== undefined) out[dbKey] = c[appKey];
  }
  if (c.fechaISO !== undefined) out.fecha_iso = c.fechaISO || null;
  if (c.duracionMin !== undefined) out.duracion_min = c.duracionMin;
  if (c.llegoDesde !== undefined) out.llego_desde = c.llegoDesde;
  if (c.correoEnviado !== undefined) out.correo_enviado = c.correoEnviado;
  if (c.correoMotivo !== undefined) out.correo_motivo = c.correoMotivo;
  return out;
}

export async function listarCitas() {
  const { data, error } = await db().from('citas').select('*').order('creada_en', { ascending: false });
  if (error) throw error;
  return (data || []).map(toApp);
}

export async function buscarCitaPorId(id) {
  const { data, error } = await db().from('citas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return toApp(data);
}

export async function crearCita(cita) {
  const { data, error } = await db().from('citas').insert(toDb(cita)).select('*').single();
  if (error) throw error;
  return toApp(data);
}

export async function actualizarCita(id, cambios) {
  const { data, error } = await db().from('citas').update(toDb(cambios)).eq('id', id).select('*').maybeSingle();
  if (error) throw error;
  return toApp(data);
}

/**
 * Citas en Postgres (Supabase). Incluye recovery_key persistente para import/idempotencia.
 */
import { createClient } from '@supabase/supabase-js';
import { newWebRecoveryKey, recoveryKeyFromWebId } from './recovery-key.js';

let _client = null;
export function db() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || url.includes('SENSITIVE') || !/^https?:\/\//i.test(url)) {
      throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY válidas');
    }
    _client = createClient(url, key, { auth: { persistSession: false } });
  }
  return _client;
}

export function resetDbClientForTests() {
  _client = null;
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
    recoveryKey: row.recovery_key,
    sourceSystem: row.source_system,
    sourceLocalId: row.source_local_id,
    importBatchId: row.import_batch_id,
    reviewStatus: row.review_status,
    reviewReason: row.review_reason,
  };
}

function toDb(c) {
  const out = {};
  const map = {
    nombre: 'nombre', correo: 'correo', telefono: 'telefono', instagram: 'instagram',
    plan: 'plan', fecha: 'fecha', hora: 'hora', hora24: 'hora24', sector: 'sector',
    estado: 'estado', historial: 'historial', notas: 'notas', origen: 'origen',
    dispositivo: 'dispositivo', navegador: 'navegador',
    recoveryKey: 'recovery_key', sourceSystem: 'source_system', sourceLocalId: 'source_local_id',
    importBatchId: 'import_batch_id', reviewStatus: 'review_status', reviewReason: 'review_reason',
  };
  for (const [appKey, dbKey] of Object.entries(map)) {
    if (c[appKey] !== undefined) out[dbKey] = c[appKey];
  }
  if (c.fechaISO !== undefined) out.fecha_iso = c.fechaISO || null;
  if (c.duracionMin !== undefined) out.duracion_min = c.duracionMin;
  if (c.llegoDesde !== undefined) out.llego_desde = c.llegoDesde;
  if (c.correoEnviado !== undefined) out.correo_enviado = c.correoEnviado;
  if (c.correoMotivo !== undefined) out.correo_motivo = c.correoMotivo;
  out.updated_at = new Date().toISOString();
  return out;
}

export async function listarCitas() {
  const { data, error } = await db().from('citas').select('*').order('creada_en', { ascending: false });
  if (error) throw error;
  return (data || []).map(toApp);
}

export async function contarCitas() {
  const { count, error } = await db().from('citas').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

export async function buscarCitaPorId(id) {
  const { data, error } = await db().from('citas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return toApp(data);
}

export async function buscarCitaPorRecoveryKey(recoveryKey) {
  const { data, error } = await db().from('citas').select('*').eq('recovery_key', recoveryKey).maybeSingle();
  if (error) throw error;
  return toApp(data);
}

export async function crearCita(cita) {
  const row = toDb(cita);
  if (cita.id) row.id = cita.id;
  if (!row.recovery_key) {
    row.recovery_key = cita.id ? recoveryKeyFromWebId(cita.id) : newWebRecoveryKey();
  }
  if (!row.source_system) row.source_system = typeof cita.origen === 'string' ? cita.origen : 'web';
  // origen geo object from web booking must not wipe text column unexpectedly
  if (cita.origen != null && typeof cita.origen !== 'string') {
    row.origen = 'web';
  }
  const { data, error } = await db().from('citas').insert(row).select('*').single();
  if (error) throw error;
  return toApp(data);
}

export async function actualizarCita(id, cambios) {
  const { data, error } = await db().from('citas').update(toDb(cambios)).eq('id', id).select('*').maybeSingle();
  if (error) throw error;
  return toApp(data);
}

/**
 * Idempotent insert by recovery_key. Never silently overwrites conflicting data:
 * marks review_status instead.
 */
export async function upsertCitaPorRecoveryKey(cita, { conflictReason } = {}) {
  const recoveryKey = cita.recoveryKey;
  if (!recoveryKey) throw new Error('recoveryKey requerida');
  const existing = await buscarCitaPorRecoveryKey(recoveryKey);
  if (existing) {
    if (conflictReason) {
      const updated = await actualizarCita(existing.id, {
        reviewStatus: 'needs_review',
        reviewReason: conflictReason,
      });
      return { action: 'marked_review', cita: updated };
    }
    return { action: 'skipped_existing', cita: existing };
  }
  const created = await crearCita(cita);
  return { action: 'inserted', cita: created };
}

export async function registrarAudit(entry) {
  const { error } = await db().from('citas_import_audit').insert({
    batch_id: entry.batchId,
    recovery_key: entry.recoveryKey,
    source_system: entry.sourceSystem,
    source_local_id: entry.sourceLocalId || null,
    action: entry.action,
    detail: entry.detail || {},
  });
  if (error) throw error;
}

export async function guardarAgendaHealth(patch) {
  const { error } = await db().from('agenda_health').upsert({
    id: 'default',
    ...patch,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function eliminarCitaPorRecoveryKey(recoveryKey) {
  const { data, error } = await db().from('citas').delete().eq('recovery_key', recoveryKey).select('id, recovery_key');
  if (error) throw error;
  return data || [];
}

/** Deletes clearly synthetic test rows (test/ejemplo emails). Never touches unmarked real clients. */
export async function eliminarCitasDePrueba() {
  const { data, error } = await db()
    .from('citas')
    .select('id, recovery_key, correo, nombre, source_local_id')
    .or('correo.ilike.%@ejemplo.test,correo.ilike.%@test.com,correo.ilike.%.test');
  if (error) throw error;
  const rows = data || [];
  const deleted = [];
  for (const row of rows) {
    const { error: e2 } = await db().from('citas').delete().eq('id', row.id);
    if (e2) throw e2;
    deleted.push(row);
    try {
      await registrarAudit({
        batchId: 'purge-tests',
        recoveryKey: row.recovery_key || row.id,
        sourceSystem: 'purge',
        sourceLocalId: row.source_local_id || null,
        action: 'snapshot',
        detail: { purge: true, nombre: row.nombre, correo: row.correo },
      });
    } catch (_) {}
  }
  return deleted;
}

export async function eliminarCitaPorId(id) {
  const { data, error } = await db().from('citas').delete().eq('id', id).select('id, nombre, correo');
  if (error) throw error;
  return data || [];
}

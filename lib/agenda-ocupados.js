/**
 * Shared occupied-slot assembly with fail-closed rules.
 * Empty remote + known local backup => never advertise "all free".
 */

const LIBERAN = new Set(['rechazada', 'reprogramar']);
const DURACION_POR_DEFECTO = 60;

export function citaOcupaHueco(c) {
  return !LIBERAN.has(c.estado || 'en_proceso') && Boolean(c.fechaISO && c.hora24);
}

export function toOcupado(c) {
  return {
    id: c.id,
    recoveryKey: c.recoveryKey || null,
    nombre: c.nombre,
    plan: c.plan || '',
    contacto: c.telefono || '',
    fecha: c.fechaISO,
    hora: c.hora24,
    duracion: Number(c.duracionMin) || DURACION_POR_DEFECTO,
    estado: c.estado || 'en_proceso',
    correo: c.correo || '',
    source: c.source || c.origen || null,
  };
}

export function claveOcupado(c) {
  return `${c.fecha}|${c.hora}|${String(c.contacto || '').replace(/\D/g, '')}|${c.recoveryKey || c.id || ''}`;
}

export function mergeOcupados(remote = [], local = []) {
  const map = new Map();
  for (const c of local) map.set(claveOcupado(c), c);
  for (const c of remote) map.set(claveOcupado(c), c);
  return [...map.values()];
}

/**
 * Fail-closed decision.
 * - remoteError: Supabase down / misconfigured
 * - remoteEmpty && localFutureCount > 0: discrepant empty remote
 * - localError && remoteEmpty: cannot trust emptiness
 */
export function evaluateAgendaHealth({ remoteCount, remoteError, localCount, localError, localFutureCount }) {
  const reasons = [];
  if (remoteError) reasons.push('supabase_unavailable');
  if (localError) reasons.push('local_backup_unavailable');
  if (!remoteError && remoteCount === 0 && (localFutureCount > 0 || localCount > 0)) {
    reasons.push('remote_empty_but_local_has_appointments');
  }
  if (remoteError && localError) reasons.push('no_authoritative_source');

  const failClosed = reasons.length > 0;
  const canServeOcupados = !remoteError || !localError; // at least one source
  return {
    ok: !failClosed,
    failClosed,
    canServeOcupados,
    reasons,
    remoteCount,
    localCount,
    localFutureCount,
  };
}

export function filterFuture(ocupados, todayISO) {
  return ocupados.filter((c) => c.fecha && c.fecha >= todayISO);
}

export { DURACION_POR_DEFECTO, LIBERAN };

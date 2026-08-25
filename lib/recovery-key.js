/** Persistent recovery / idempotency keys for appointments. Never fecha+hora+telefono alone. */

export function recoveryKeyFromLocalSqlite(localId) {
  const id = Number(localId);
  if (!Number.isFinite(id) || id <= 0) throw new Error('localId inválido');
  return `wa:sqlite:citas_pendientes:${id}`;
}

export function recoveryKeyFromWebId(id) {
  const s = String(id || '').trim();
  if (!s) throw new Error('id web vacío');
  return `web:cita:${s}`;
}

export function newWebRecoveryKey() {
  return `web:cita:${crypto.randomUUID()}`;
}

/**
 * Compare two appointments for conflict (same recovery key already linked to different slot).
 * Returns null if compatible, or a reason string if human review is required.
 */
export function conflictReason(existing, incoming) {
  if (!existing) return null;
  const fields = [
    ['fecha_iso', incoming.fechaISO ?? incoming.fecha_iso],
    ['hora24', incoming.hora24],
    ['plan', incoming.plan],
    ['telefono', incoming.telefono],
    ['nombre', incoming.nombre],
  ];
  const diffs = [];
  for (const [key, next] of fields) {
    const prev = existing[key] ?? existing[{
      fecha_iso: 'fechaISO',
      hora24: 'hora24',
      plan: 'plan',
      telefono: 'telefono',
      nombre: 'nombre',
    }[key]];
    if (next == null || next === '') continue;
    if (prev == null || prev === '') continue;
    if (String(prev).trim() !== String(next).trim()) diffs.push(key);
  }
  return diffs.length ? `campo_difiere:${diffs.join(',')}` : null;
}

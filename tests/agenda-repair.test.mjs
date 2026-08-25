import assert from 'node:assert/strict';
import {
  recoveryKeyFromLocalSqlite,
  recoveryKeyFromWebId,
  conflictReason,
} from '../lib/recovery-key.js';
import {
  evaluateAgendaHealth,
  mergeOcupados,
  citaOcupaHueco,
  toOcupado,
} from '../lib/agenda-ocupados.js';

function test(name, fn) {
  try {
    fn();
    console.log('ok -', name);
  } catch (err) {
    console.error('FAIL -', name, err.message);
    process.exitCode = 1;
  }
}

test('recovery key from sqlite id is stable and not phone/date', () => {
  const k = recoveryKeyFromLocalSqlite(42);
  assert.equal(k, 'wa:sqlite:citas_pendientes:42');
  assert.equal(recoveryKeyFromLocalSqlite(42), k);
});

test('recovery key rejects invalid local id', () => {
  assert.throws(() => recoveryKeyFromLocalSqlite('x'));
});

test('web recovery key uses uuid not phone', () => {
  const id = '11111111-1111-1111-1111-111111111111';
  assert.equal(recoveryKeyFromWebId(id), `web:cita:${id}`);
});

test('conflictReason ignores identical rows', () => {
  const existing = { fecha_iso: '2026-08-15', hora24: '10:00', plan: 'Social', telefono: '5939', nombre: 'A' };
  assert.equal(conflictReason(existing, { fechaISO: '2026-08-15', hora24: '10:00', plan: 'Social', telefono: '5939', nombre: 'A' }), null);
});

test('conflictReason marks service change for review', () => {
  const existing = { fecha_iso: '2026-08-15', hora24: '10:00', plan: 'Social', telefono: '5939', nombre: 'A' };
  const reason = conflictReason(existing, { fechaISO: '2026-08-15', hora24: '10:00', plan: 'Novia', telefono: '5939', nombre: 'A' });
  assert.match(reason, /plan/);
});

test('appointments without phone still occupy', () => {
  assert.equal(citaOcupaHueco({ estado: 'en_proceso', fechaISO: '2026-08-15', hora24: '10:00' }), true);
  const o = toOcupado({ id: '1', nombre: 'X', fechaISO: '2026-08-15', hora24: '10:00', telefono: '' });
  assert.equal(o.contacto, '');
});

test('valid repeat same phone different recovery keys both kept', () => {
  const a = { fecha: '2026-08-20', hora: '10:00', contacto: '5939111', recoveryKey: 'wa:sqlite:citas_pendientes:1', id: 'a' };
  const b = { fecha: '2026-08-20', hora: '14:00', contacto: '5939111', recoveryKey: 'wa:sqlite:citas_pendientes:2', id: 'b' };
  const merged = mergeOcupados([a], [b]);
  assert.equal(merged.length, 2);
});

test('fail-closed when remote empty but local has future', () => {
  const h = evaluateAgendaHealth({ remoteCount: 0, remoteError: null, localCount: 37, localError: null, localFutureCount: 1 });
  assert.equal(h.failClosed, true);
  assert.ok(h.reasons.includes('remote_empty_but_local_has_appointments'));
});

test('fail-closed when supabase down', () => {
  const h = evaluateAgendaHealth({ remoteCount: 0, remoteError: 'boom', localCount: 5, localError: null, localFutureCount: 1 });
  assert.equal(h.failClosed, true);
  assert.ok(h.canServeOcupados);
});

test('hard fail when both sources down', () => {
  const h = evaluateAgendaHealth({ remoteCount: 0, remoteError: 'x', localCount: 0, localError: 'y', localFutureCount: 0 });
  assert.equal(h.failClosed, true);
  assert.equal(h.canServeOcupados, false);
});

test('healthy when remote has rows', () => {
  const h = evaluateAgendaHealth({ remoteCount: 12, remoteError: null, localCount: 12, localError: null, localFutureCount: 3 });
  assert.equal(h.failClosed, false);
});

test('idempotent key import simulation', () => {
  const seen = new Set();
  const importOnce = (localId) => {
    const k = recoveryKeyFromLocalSqlite(localId);
    if (seen.has(k)) return 'skipped_existing';
    seen.add(k);
    return 'inserted';
  };
  assert.equal(importOnce(7), 'inserted');
  assert.equal(importOnce(7), 'skipped_existing');
  assert.equal(importOnce(8), 'inserted');
});

console.log('done');

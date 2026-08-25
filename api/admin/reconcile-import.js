/**
 * POST /api/admin/reconcile-import
 * Idempotent import of local WhatsApp appointments into Supabase.
 * Auth: admin session OR internal WhatsApp bearer token.
 * Never sends WhatsApp. Never deletes remote rows except action=purge_tests (synthetic emails only).
 */
import { leerSesion } from '../../lib/auth.js';
import {
  upsertCitaPorRecoveryKey,
  registrarAudit,
  listarCitas,
  guardarAgendaHealth,
  eliminarCitasDePrueba,
  buscarCitaPorRecoveryKey,
} from '../../lib/db-citas.js';
import { recoveryKeyFromLocalSqlite, conflictReason } from '../../lib/recovery-key.js';
import { randomUUID } from 'crypto';

function autorizado(req) {
  const sesion = leerSesion(req, process.env.SESSION_SECRET || '');
  if (sesion) return { tipo: 'admin', sesion };
  const esperado = process.env.WHATSAPP_API_TOKEN;
  const enviado = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (esperado && enviado === esperado) return { tipo: 'internal' };
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  if (!autorizado(req)) return res.status(401).json({ error: 'No autorizado' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  if (body.action === 'purge_tests') {
    const deleted = await eliminarCitasDePrueba();
    const remoteCount = (await listarCitas()).length;
    try {
      await guardarAgendaHealth({
        remote_count: remoteCount,
        notes: 'purge_tests deleted ' + deleted.length,
        last_reconcile_at: new Date().toISOString(),
      });
    } catch (_) {}
    return res.status(200).json({
      ok: true,
      deleted: deleted.length,
      remaining: remoteCount,
      ids: deleted.map((d) => d.recovery_key || d.id),
    });
  }

  const dryRun = Boolean(body.dryRun);
  const citas = Array.isArray(body.citas) ? body.citas : [];
  if (!citas.length) return res.status(400).json({ error: 'Falta citas[]' });

  const batchId = body.batchId || randomUUID();
  const summary = { batchId, dryRun, inserted: 0, skipped: 0, markedReview: 0, errors: 0, items: [] };

  for (const raw of citas) {
    try {
      const localId = raw.localId ?? raw.id;
      const recoveryKey = raw.recoveryKey || recoveryKeyFromLocalSqlite(localId);
      const incoming = {
        nombre: raw.nombre || '',
        correo: raw.correo || '',
        telefono: raw.telefono || '',
        instagram: raw.instagram || '',
        plan: raw.plan || raw.servicio || '',
        fecha: raw.fecha || '',
        hora: raw.hora || '',
        fechaISO: raw.fechaISO || null,
        hora24: raw.hora24 || '',
        duracionMin: Number(raw.duracionMin) || 60,
        sector: raw.sector || '',
        notas: raw.notas || '',
        estado: raw.estado || 'en_proceso',
        origen: 'whatsapp_reconcile',
        recoveryKey,
        sourceSystem: 'whatsapp_sqlite',
        sourceLocalId: String(localId),
        importBatchId: batchId,
      };

      const existing = await buscarCitaPorRecoveryKey(recoveryKey);
      const reason = conflictReason(existing, incoming);

      if (dryRun) {
        const action = existing ? (reason ? 'marked_review' : 'skipped_existing') : 'inserted';
        summary.items.push({ recoveryKey, action, dryRun: true, reason });
        if (action === 'inserted') summary.inserted++;
        else if (action === 'marked_review') summary.markedReview++;
        else summary.skipped++;
        continue;
      }

      const result = await upsertCitaPorRecoveryKey(incoming, { conflictReason: reason });
      await registrarAudit({
        batchId,
        recoveryKey,
        sourceSystem: 'whatsapp_sqlite',
        sourceLocalId: String(localId),
        action: result.action,
        detail: {
          reason,
          fechaISO: incoming.fechaISO,
          hora24: incoming.hora24,
          plan: incoming.plan,
          hasPhone: Boolean(incoming.telefono),
        },
      });
      summary.items.push({ recoveryKey, action: result.action, id: result.cita?.id, reason });
      if (result.action === 'inserted') summary.inserted++;
      else if (result.action === 'marked_review') summary.markedReview++;
      else summary.skipped++;
    } catch (err) {
      summary.errors++;
      summary.items.push({ error: err.message || String(err), localId: raw.localId ?? raw.id });
      try {
        await registrarAudit({
          batchId,
          recoveryKey: String(raw.recoveryKey || raw.localId || 'unknown'),
          sourceSystem: 'whatsapp_sqlite',
          sourceLocalId: String(raw.localId ?? raw.id ?? ''),
          action: 'error',
          detail: { message: err.message || String(err) },
        });
      } catch (_) {}
    }
  }

  try {
    const remoteCount = (await listarCitas()).length;
    await guardarAgendaHealth({
      remote_count: remoteCount,
      last_reconcile_at: new Date().toISOString(),
      notes: `batch ${batchId}`,
    });
  } catch (_) {}

  return res.status(200).json(summary);
}

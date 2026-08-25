/**
 * GET /api/agenda — horarios ocupados para el bot (Bearer token).
 * Fail-closed: si Supabase está vacío/caído/discrepante vs respaldo local, no finge "todo libre".
 */
import { listarCitas, contarCitas, guardarAgendaHealth } from '../lib/db-citas.js';
import {
  citaOcupaHueco,
  toOcupado,
  mergeOcupados,
  evaluateAgendaHealth,
  filterFuture,
} from '../lib/agenda-ocupados.js';

function todayISOEcuador() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function ocupadosLocalesDesdeBot() {
  const base = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!base || !token) {
    const err = new Error('WHATSAPP_API_URL/TOKEN ausentes');
    err.code = 'local_config';
    throw err;
  }
  const r = await fetch(`${base.replace(/\/$/, '')}/agenda/ocupados`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`bot respondió ${r.status}`);
  const data = await r.json();
  return {
    ocupados: (data.ocupados || []).map((c) => ({
      id: c.id,
      recoveryKey: c.recoveryKey || null,
      nombre: c.nombre,
      plan: c.plan || '',
      contacto: c.contacto || c.telefono || '',
      fecha: c.fecha,
      hora: c.hora,
      duracion: Number(c.duracion) || 60,
      estado: c.estado || 'en_proceso',
      correo: c.correo || '',
      source: 'whatsapp_sqlite',
    })),
    futureCount: Number(data.futureCount) || 0,
    total: Number(data.total) || 0,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const esperado = process.env.WHATSAPP_API_TOKEN;
  const enviado = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!esperado || enviado !== esperado) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  res.setHeader('Cache-Control', 'no-store');

  let remote = [];
  let remoteError = null;
  let remoteCount = 0;
  try {
    const citas = await listarCitas();
    remoteCount = citas.length;
    remote = citas.filter(citaOcupaHueco).map((c) => ({ ...toOcupado(c), source: c.sourceSystem || c.origen || 'supabase' }));
  } catch (err) {
    remoteError = err.message || String(err);
    console.error('[agenda] supabase:', remoteError);
  }

  let local = [];
  let localError = null;
  let localCount = 0;
  let localFutureCount = 0;
  try {
    const loc = await ocupadosLocalesDesdeBot();
    local = loc.ocupados;
    localCount = loc.total;
    localFutureCount = loc.futureCount;
  } catch (err) {
    localError = err.message || String(err);
    console.warn('[agenda] respaldo local:', localError);
  }

  const health = evaluateAgendaHealth({
    remoteCount,
    remoteError,
    localCount,
    localError,
    localFutureCount,
  });

  try {
    await guardarAgendaHealth({
      remote_count: remoteCount,
      local_backup_count: localCount,
      last_fail_closed_at: health.failClosed ? new Date().toISOString() : null,
      notes: health.reasons.join(',') || null,
    });
  } catch (_) {
    /* health table may not exist yet */
  }

  if (health.failClosed && !health.canServeOcupados) {
    return res.status(503).json({
      error: 'Agenda no confiable',
      failClosed: true,
      reasons: health.reasons,
      ocupados: [],
    });
  }

  // While reconciling: always union remote + local. Never return empty as "all free" when local has rows.
  const ocupados = mergeOcupados(remote, local);

  if (health.failClosed) {
    return res.status(200).json({
      ocupados,
      failClosed: true,
      reasons: health.reasons,
      sources: { remote: remoteCount, local: localCount },
      warning: 'Agenda en modo seguro: se combinó remoto + respaldo local; no asumir huecos libres sin cruzar ambas fuentes.',
    });
  }

  return res.status(200).json({
    ocupados,
    failClosed: false,
    sources: { remote: remoteCount, local: localCount },
    asOf: todayISOEcuador(),
  });
}

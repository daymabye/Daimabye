/**
 * GET /api/disponibilidad?fecha=YYYY-MM-DD&duracion=60
 * Public agenda of FREE slots only. Fail-closed: if occupied sources are unreliable, returns no free slots.
 */
import { listarCitas } from '../lib/db-citas.js';
import {
  citaOcupaHueco,
  toOcupado,
  mergeOcupados,
  evaluateAgendaHealth,
} from '../lib/agenda-ocupados.js';

function aMinutos(hora24) {
  const m = String(hora24 || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function aHora(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function todayISOEcuador() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function localOcupados() {
  const base = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!base || !token) throw new Error('local_unavailable');
  const r = await fetch(`${base.replace(/\/$/, '')}/agenda/ocupados`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`bot ${r.status}`);
  const data = await r.json();
  return {
    ocupados: (data.ocupados || []).map((c) => ({
      fecha: c.fecha,
      hora: c.hora,
      duracion: Number(c.duracion) || 60,
      contacto: c.contacto || '',
      recoveryKey: c.recoveryKey || null,
      id: c.id,
    })),
    total: Number(data.total) || 0,
    futureCount: Number(data.futureCount) || 0,
  };
}

function seSolapan(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const fecha = String(req.query.fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Usa fecha=YYYY-MM-DD' });
  }
  const duracion = Math.min(Math.max(Number(req.query.duracion) || 60, 15), 480);
  const apertura = aMinutos(String(req.query.apertura || '08:00')) ?? 8 * 60;
  const cierre = aMinutos(String(req.query.cierre || '17:00')) ?? 17 * 60;
  const paso = Math.min(Math.max(Number(req.query.paso) || 30, 15), 60);

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let remote = [];
  let remoteError = null;
  let remoteCount = 0;
  try {
    const citas = await listarCitas();
    remoteCount = citas.length;
    remote = citas.filter(citaOcupaHueco).map(toOcupado);
  } catch (err) {
    remoteError = err.message || String(err);
  }

  let local = [];
  let localError = null;
  let localCount = 0;
  let localFutureCount = 0;
  try {
    const loc = await localOcupados();
    local = loc.ocupados;
    localCount = loc.total;
    localFutureCount = loc.futureCount;
  } catch (err) {
    localError = err.message || String(err);
  }

  const health = evaluateAgendaHealth({
    remoteCount,
    remoteError,
    localCount,
    localError,
    localFutureCount,
  });

  // Fail closed for PUBLIC free-slot listing: if unreliable, return zero free slots.
  if (health.failClosed) {
    return res.status(200).json({
      fecha,
      libres: [],
      failClosed: true,
      reasons: health.reasons,
      mensaje: 'La agenda no es confiable ahora mismo; no se muestran huecos libres.',
    });
  }

  const ocupadosDia = mergeOcupados(remote, local).filter((c) => c.fecha === fecha);
  const hoy = todayISOEcuador();
  const ahoraMin = fecha === hoy
    ? aMinutos(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace('.', ':'))
    : 0;

  const libres = [];
  for (let t = apertura; t + duracion <= cierre; t += paso) {
    if (fecha === hoy && ahoraMin != null && t < ahoraMin) continue;
    const fin = t + duracion;
    const choque = ocupadosDia.some((c) => {
      const oi = aMinutos(c.hora);
      if (oi == null) return false;
      return seSolapan(t, fin, oi, oi + (Number(c.duracion) || 60));
    });
    if (!choque) libres.push(aHora(t));
  }

  return res.status(200).json({
    fecha,
    duracion,
    libres,
    failClosed: false,
    // Never expose names/phones publicly
    ocupadosCount: ocupadosDia.length,
  });
}


/**
 * POST /api/booking — guarda una reserva.
 *
 * Cada cita es su propia fila en Postgres (Supabase). Antes era un archivo JSON por cita en
 * Vercel Blob; se migró porque ese store quedó suspendido (límite gratuito superado) y las
 * citas dejaron de guardarse/leerse/mandar correo.
 */
import crypto from 'node:crypto';
import { crearCita, actualizarCita } from '../lib/db-citas.js';
import { recoveryKeyFromWebId } from '../lib/recovery-key.js';
import { enviarCorreo, correoParaClienta, correoParaAdmin } from '../lib/email.js';

const LARGOS = {
  nombre: 80, correo: 120, telefono: 30, instagram: 40,
  plan: 60, fecha: 20, hora: 40, sector: 80, notas: 500,
  fechaISO: 10, hora24: 5,
};

const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Deja "2026-08-15" tal cual; cualquier otra cosa, vacia. */
function normalizarFecha(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim()) ? String(v).trim() : '';
}

/** "20:00", "8:00 PM" y "8 pm" -> "20:00". Los rangos aproximados de la web quedan vacios. */
function normalizarHora(v) {
  const t = String(v || '').trim().toLowerCase();
  if (/\d{1,2}\s*[:.]?\d{0,2}\s*[-–]/.test(t)) return ''; // es un rango, no una hora
  const m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return '';
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const sufijo = (m[3] || '').replace(/\./g, '');
  if (sufijo.startsWith('p') && h < 12) h += 12;
  if (sufijo.startsWith('a') && h === 12) h = 0;
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

import { huecoLibre, esChoqueDeHorario } from '../lib/hueco-libre.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const cuerpo = req.body && typeof req.body === 'object' ? req.body : {};
  const campo = (k) => String(cuerpo[k] ?? '').trim().slice(0, LARGOS[k] ?? 100);

  const nombre = campo('nombre');
  const correo = campo('correo');
  if (nombre.length < 2) return res.status(400).json({ error: 'Falta el nombre' });
  if (!CORREO_VALIDO.test(correo)) return res.status(400).json({ error: 'El correo no es válido' });

  const h = req.headers;
  const num = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const agente = String(h['user-agent'] || '');

  const id = crypto.randomUUID();
  const citaBase = {
    id,
    creadaEn: new Date().toISOString(),
    nombre,
    correo,
    telefono: campo('telefono'),
    instagram: campo('instagram').replace(/^@+/, ''),
    plan: campo('plan') || 'Consulta general',
    fecha: campo('fecha'),
    hora: campo('hora'),
    fechaISO: normalizarFecha(campo('fechaISO')) || normalizarFecha(campo('fecha')),
    hora24: normalizarHora(campo('hora24')) || normalizarHora(campo('hora')),
    duracionMin: Number.parseInt(cuerpo.duracionMin, 10) > 0 ? Number.parseInt(cuerpo.duracionMin, 10) : 60,
    sector: campo('sector'),
    estado: 'en_proceso',
    historial: [{ estado: 'en_proceso', en: new Date().toISOString() }],
    notas: campo('notas'),
    origen: {
      ciudad: safeDecode(h['x-vercel-ip-city']),
      region: safeDecode(h['x-vercel-ip-country-region']),
      pais: String(h['x-vercel-ip-country'] || ''),
      lat: num(h['x-vercel-ip-latitude']),
      lon: num(h['x-vercel-ip-longitude']),
    },
    dispositivo: /Mobi|Android|iPhone|iPad/i.test(agente) ? 'Móvil' : 'Escritorio',
    navegador: agente.slice(0, 180),
    llegoDesde: String(h.referer || '').slice(0, 200),
    recoveryKey: recoveryKeyFromWebId(id),
    sourceSystem: 'web',
  };

  // Sin fecha y hora normalizadas no se puede comprobar nada, y una cita sin
  // hueco definido no deberia entrar a la agenda.
  if (!citaBase.fechaISO || !citaBase.hora24) {
    return res.status(400).json({ error: 'Falta la fecha o la hora de la cita' });
  }

  // Antes se insertaba directo, sin mirar si la hora estaba tomada: dos
  // clientas podian reservar el mismo turno y las dos recibian su correo de
  // confirmacion. Se comprueba aca (para dar un mensaje util con alternativas)
  // y ademas hay un indice unico en la base, que es lo unico que gana una
  // carrera entre dos reservas simultaneas.
  const hueco = await huecoLibre({
    fechaISO: citaBase.fechaISO,
    hora24: citaBase.hora24,
    duracionMin: citaBase.duracionMin,
  });
  if (!hueco.libre) {
    if (hueco.error) console.error('[booking] no se pudo comprobar la agenda:', hueco.error);
    return res.status(409).json({
      error: hueco.motivo,
      code: 'hora_ocupada',
      alternativas: hueco.alternativas || [],
    });
  }

  let cita;
  try {
    cita = await crearCita(citaBase);
  } catch (err) {
    // El indice unico salto: alguien reservo esa misma hora entre el chequeo de
    // arriba y este insert. Es la carrera que el chequeo solo no puede cerrar.
    if (esChoqueDeHorario(err)) {
      console.log('[booking] carrera por el mismo hueco:', citaBase.fechaISO, citaBase.hora24);
      return res.status(409).json({
        error: 'Alguien tomó esa hora hace un instante. Elegí otra, por favor.',
        code: 'hora_ocupada',
      });
    }
    console.error('[booking] no se pudo guardar la cita:', err);
    return res.status(500).json({ error: 'No se pudo guardar la reserva' });
  }

  const baseUrl = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  let correoEnviado = false;
  let correoMotivo = '';
  try {
    const aClienta = correoParaClienta(cita);
    const aAdmin = correoParaAdmin(cita, `${baseUrl}/admin`);
    const [clienta] = await Promise.all([
      enviarCorreo({ para: cita.correo, ...aClienta }),
      enviarCorreo({ para: process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL, ...aAdmin }),
    ]);
    correoEnviado = Boolean(clienta?.ok);
    correoMotivo = clienta?.ok ? '' : String(clienta?.motivo || 'no se pudo enviar');
  } catch (err) {
    correoMotivo = err?.message || String(err);
    console.error('[booking] fallo al notificar por correo:', correoMotivo);
  }

  if (!correoEnviado) {
    console.warn('[booking] la clienta NO recibio el correo:', cita.correo, '|', correoMotivo);
  }
  try {
    await actualizarCita(cita.id, { correoEnviado, correoMotivo });
  } catch (err) {
    console.error('[booking] no se pudo anotar el resultado del correo:', err);
  }

  return res.status(201).json({ ok: true, id: cita.id, recoveryKey: cita.recoveryKey, correoEnviado, correoMotivo });
}

function safeDecode(valor) {
  const s = String(valor || '');
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * POST /api/booking — guarda una reserva.
 *
 * Cada cita es su propia fila en Postgres (Supabase). Antes era un archivo JSON por cita en
 * Vercel Blob; se migró porque ese store quedó suspendido (límite gratuito superado) y las
 * citas dejaron de guardarse/leerse/mandar correo.
 */
import crypto from 'node:crypto';
import { crearCita, actualizarCita } from '../lib/db-citas.js';
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

  const citaBase = {
    id: crypto.randomUUID(),
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
  };

  let cita;
  try {
    cita = await crearCita(citaBase);
  } catch (err) {
    console.error('[booking] no se pudo guardar la cita:', err);
    return res.status(500).json({ error: 'No se pudo guardar la reserva' });
  }

  // Los correos van DESPUÉS de guardar y no pueden tumbar la reserva: si el proveedor falla,
  // la cita ya está a salvo y la administradora la ve igual en el panel.
  const base = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  let correoEnviado = false;
  let correoMotivo = '';
  try {
    const aClienta = correoParaClienta(cita);
    const aAdmin = correoParaAdmin(cita, `${base}/admin`);
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

  // Se anota el resultado real del correo, salga bien o mal: con solo registrar los
  // fallos, un envio exitoso se quedaba en el valor por defecto (false) en la base de
  // datos, y el panel/consultas futuras no podian distinguir "se mando" de "nunca se supo".
  if (!correoEnviado) {
    console.warn('[booking] la clienta NO recibio el correo:', cita.correo, '|', correoMotivo);
  }
  try {
    await actualizarCita(cita.id, { correoEnviado, correoMotivo });
  } catch (err) {
    console.error('[booking] no se pudo anotar el resultado del correo:', err);
  }

  // Quien llama (el bot de WhatsApp) necesita saberlo para no prometerle a la clienta un
  // correo que no le va a llegar, y para avisarla por WhatsApp en su lugar.
  return res.status(201).json({ ok: true, id: cita.id, correoEnviado, correoMotivo });
}

function safeDecode(valor) {
  const s = String(valor || '');
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

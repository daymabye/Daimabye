/**
 * POST /api/booking — guarda una reserva.
 *
 * Cada cita se escribe como SU PROPIO archivo. Si dos clientas reservan en el mismo segundo,
 * ninguna pisa a la otra (guardar todo en un único archivo compartido sí tendría esa carrera).
 * El almacén es privado: nadie puede leer estos datos con una URL.
 */
import crypto from 'node:crypto';
import { put } from '@vercel/blob';
import { enviarCorreo, correoParaClienta, correoParaAdmin } from '../lib/email.js';

const LARGOS = {
  nombre: 80, correo: 120, telefono: 30, instagram: 40,
  plan: 60, fecha: 20, hora: 40, sector: 80, notas: 500,
};

const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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

  const cita = {
    id: crypto.randomUUID(),
    creadaEn: new Date().toISOString(),
    nombre,
    correo,
    telefono: campo('telefono'),
    instagram: campo('instagram').replace(/^@+/, ''),
    plan: campo('plan') || 'Consulta general',
    fecha: campo('fecha'),
    hora: campo('hora'),
    sector: campo('sector'),
    // Toda cita nace SIN confirmar: la administradora la acepta desde el panel.
    estado: 'en_proceso',
    historial: [{ estado: 'en_proceso', en: new Date().toISOString() }],
    notas: campo('notas'),
    // Vercel añade estas cabeceras: ubicación APROXIMADA (nivel ciudad) de la conexión.
    // No es la dirección de la clienta y así se etiqueta en el panel.
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

  try {
    await put(`citas/${cita.creadaEn}-${cita.id}.json`, JSON.stringify(cita), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
    });
  } catch (err) {
    console.error('[booking] no se pudo guardar la cita:', err);
    return res.status(500).json({ error: 'No se pudo guardar la reserva' });
  }

  // Los correos van DESPUÉS de guardar y no pueden tumbar la reserva: si el proveedor falla,
  // la cita ya está a salvo y la administradora la ve igual en el panel.
  const base = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  try {
    const aClienta = correoParaClienta(cita);
    const aAdmin = correoParaAdmin(cita, `${base}/admin`);
    await Promise.allSettled([
      enviarCorreo({ para: cita.correo, ...aClienta }),
      enviarCorreo({ para: process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL, ...aAdmin }),
    ]);
  } catch (err) {
    console.error('[booking] fallo al notificar por correo:', err);
  }

  return res.status(201).json({ ok: true, id: cita.id });
}

function safeDecode(valor) {
  const s = String(valor || '');
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

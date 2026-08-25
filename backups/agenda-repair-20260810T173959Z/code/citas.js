import { guardarCita } from './db.js';
import { avisarNuevaCita, confirmarALaClienta } from './notificaciones.js';
import { verificarHorario } from './agenda.js';
import { duracionDe } from './config.js';
import { describirFecha, yaPaso, ahoraTexto } from './fecha.js';

/**
 * Registra una cita tomada por WhatsApp.
 *
 * Se envia al MISMO endpoint que usa el formulario del sitio (`/api/booking`). Asi la cita
 * aparece en el panel de administracion junto a las demas, y de paso salen los correos de
 * confirmacion a la clienta y a Daima, sin duplicar esa logica aqui ni necesitar
 * credenciales del almacen de datos.
 */
/**
 * Las citas se registran de UNA EN UNA.
 *
 * Comprobar el hueco y guardarlo son dos pasos con una consulta de red en medio. Con dos
 * clientas confirmando a la vez, las dos comprobaban ANTES de que ninguna hubiera guardado
 * y las dos se llevaban la misma hora — probado, pasaba. Encadenar las llamadas cierra esa
 * ventana: la segunda comprueba cuando la primera ya esta escrita.
 */
let turno = Promise.resolve();
export function crearCitaDesdeWhatsapp(jid, datos, telefono) {
  const mio = turno.then(() => registrar(jid, datos, telefono));
  // El turno sigue vivo aunque esta cita falle; si no, un error dejaria la cola rota.
  turno = mio.catch(() => {});
  return mio;
}

async function registrar(jid, datos, telefono) {
  const base = process.env.DAIMA_WEB_URL || 'https://soydaima.vercel.app';

  const cita = {
    nombre: datos.nombre || '',
    correo: datos.correo || '',
    telefono: telefono || jid,
    instagram: datos.instagram || '',
    plan: datos.plan || 'Consulta general',
    fecha: describirFecha(datos.fechaISO)?.texto || datos.fecha || '',
    // La hora escrita sale de la normalizada, igual que la fecha: si el aviso a Daima dice
    // "4 de la tarde" y el comprobante de la clienta dice "16:00", alguien acaba dudando.
    hora: datos.hora24 || datos.hora || '',
    // Fecha y hora normalizadas: sin esto no se puede saber si un horario choca con otro.
    fechaISO: datos.fechaISO || '',
    hora24: datos.hora24 || '',
    // La duración la marca el servicio, no el modelo: un maquillaje ocupa 2 horas se lo
    // crea o no el modelo, y de eso depende que no se solapen dos clientas.
    duracionMin: duracionDe(datos.plan),
    sector: datos.sector || '',
    notas: [datos.notas, 'Agendada por WhatsApp'].filter(Boolean).join(' · '),
  };

  // Último candado antes de guardar. El modelo debería haber consultado la disponibilidad,
  // pero si no lo hizo, aquí se corta: dos clientas con el mismo horario es un problema real
  // en el estudio, no un detalle.
  if (!cita.fechaISO || !cita.hora24) {
    console.warn('[citas] se rechazó una cita sin fecha u hora normalizada:', cita.fechaISO, cita.hora24);
    return { ok: false, faltanDatos: true, cita };
  }

  {
    const hueco = await verificarHorario(cita.fechaISO, cita.hora24, cita.duracionMin, cita.telefono);

    // Ya la tenia agendada ella misma (confirmo dos veces): no se duplica ni se le dice
    // que esta ocupado, porque el hueco es suyo.
    if (hueco.yaEsSuya) {
      console.log('[citas] la clienta ya tenia esa cita, no se duplica:', cita.nombre);
      return { ok: true, yaExistia: true, sincronizada: true, cita };
    }

    // Una cita en el pasado no es un choque: es una fecha mal entendida. Se distingue para
    // que el bot le diga la verdad ("esa hora ya pasó") y no un "está ocupado" que es falso.
    if (hueco.fueraDeHorario) {
      console.warn('[citas] se rechazó una cita fuera de horario:', cita.hora24, '| atiende', hueco.horario);
      return { ok: false, fueraDeHorario: true, ...hueco, cita };
    }

    if (hueco.yaPaso) {
      console.warn('[citas] se rechazó una cita en el pasado:', cita.fechaISO, cita.hora24, '| ahora:', ahoraTexto());
      return { ok: false, yaPaso: true, ...hueco, cita };
    }

    if (!hueco.libre) {
      console.warn('[citas] se rechazó una cita por choque de horario:', cita.fechaISO, cita.hora24);
      return { ok: false, ocupado: true, ...hueco, cita };
    }
  }

  let sincronizada = false;
  let motivo = '';
  let correoEnviado = false;
  let correoMotivo = '';

  try {
    const resp = await fetch(`${base}/api/booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cita),
      signal: AbortSignal.timeout(15000),
    });

    if (resp.ok) {
      sincronizada = true;
      // El sitio dice si el correo salio de verdad. Importa: si no salio, hay que avisarle
      // a la clienta por WhatsApp y NO prometerle un correo que no va a recibir.
      const d = await resp.json().catch(() => ({}));
      correoEnviado = Boolean(d.correoEnviado);
      correoMotivo = String(d.correoMotivo || '');
    } else {
      motivo = `el sitio respondio ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`;
    }
  } catch (err) {
    motivo = err.message;
  }

  // Toda cita queda registrada localmente, haya llegado al panel o no: asi se pueden
  // consultar desde el telefono y ninguna se pierde si el sitio fallo.
  if (!sincronizada) console.error('[citas] no se pudo registrar en el sitio:', motivo);
  guardarCita(jid, motivo ? { ...cita, motivo } : cita, sincronizada);

  if (!correoEnviado && correoMotivo) {
    console.warn('[citas] la clienta no recibio el correo:', cita.correo, '|', correoMotivo);
  }

  // La confirmacion a la clienta la escribe el CODIGO, con los datos que se guardaron, no el
  // modelo. Asi lo que ella lee es exactamente lo que quedo en la agenda: si el modelo se
  // equivoca de hora al despedirse, este mensaje la desmiente con el dato bueno.
  await confirmarALaClienta(jid, cita, correoEnviado);
  await avisarNuevaCita(cita, sincronizada, correoEnviado, correoMotivo);

  return { ok: true, sincronizada, correoEnviado, correoMotivo, cita };
}

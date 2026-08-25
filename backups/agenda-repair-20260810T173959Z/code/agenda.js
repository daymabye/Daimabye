/**
 * Disponibilidad de horarios.
 *
 * Antes de agendar hay que saber si ese hueco ya está tomado. Las citas viven en dos
 * sitios —las del formulario de la web y las que toma el bot— así que la lista completa se
 * pide al sitio, que es quien las tiene todas.
 *
 * Todo se compara en minutos desde la medianoche: es aritmética simple y no depende de
 * zonas horarias, porque el estudio atiende siempre en su propia hora local.
 */
import { listarCitas } from './db.js';
import { obtenerAjuste } from './config.js';
import { yaPaso, hoyISO, horaAhora, sumarDias, describirFecha } from './fecha.js';

// Una cita normal ocupa 2 horas; cada servicio puede definir la suya.
export const DURACION_POR_DEFECTO = 120;

/** "14:30" → 870 minutos. Devuelve null si no es una hora válida. */
export function aMinutos(hora24) {
  const m = String(hora24 || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** 870 → "14:30" */
export function aHora(minutos) {
  const h = Math.floor(minutos / 60) % 24;
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const seSolapan = (inicioA, finA, inicioB, finB) => inicioA < finB && inicioB < finA;

/**
 * Trae del sitio las citas que ocupan sitio. Si el sitio no responde, se sigue con las que
 * el propio bot registró: es mejor comprobar contra una lista parcial que no comprobar nada.
 */
async function ocupadosDelSitio() {
  const base = process.env.DAIMA_WEB_URL || 'https://soydaima.vercel.app';
  const token = process.env.WHATSAPP_INTERNAL_TOKEN;
  try {
    const r = await fetch(`${base}/api/agenda`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`respondió ${r.status}`);
    return (await r.json()).ocupados || [];
  } catch (err) {
    console.warn('[agenda] no se pudo consultar el sitio, se usa solo lo local:', err.message);
    return null;
  }
}

/** Horario de atención del estudio, en minutos desde medianoche. */
export function horarioAtencion() {
  return {
    apertura: aMinutos(obtenerAjuste('hora_apertura', '08:00')) ?? 8 * 60,
    cierre: aMinutos(obtenerAjuste('hora_cierre', '21:30')) ?? 21 * 60 + 30,
  };
}

/** Respaldo local: las citas que tomó el bot y quedaron guardadas aquí. */
function ocupadosLocales() {
  return listarCitas(300)
    .filter((c) => c.fechaISO && c.hora24)
    .map((c) => ({
      nombre: c.nombre,
      contacto: c.telefono || '',
      fecha: c.fechaISO,
      hora: c.hora24,
      duracion: Number(c.duracionMin) || DURACION_POR_DEFECTO,
    }));
}

/** Identifica una cita sin importar de qué fuente vino, para no contarla dos veces. */
const claveDeOcupado = (c) => `${c.fecha}|${c.hora}|${String(c.contacto || '').replace(/[^0-9]/g, '')}`;

/**
 * Se combinan SIEMPRE las dos fuentes, nunca se elige una u otra.
 *
 * El fallo real: el sitio puede responder 200 con `ocupados: []` sin que sea un error de
 * red — por ejemplo si el almacén de fotos/citas del sitio esta caido, cada cita individual
 * falla en silencio al leerla y la lista sale vacia igual, pero con un "200 OK" que antes se
 * tomaba como "la agenda del sitio es la verdad, y esta vacia". Con eso, `verificarHorario`
 * decia "libre" sobre una hora que en realidad ya tenia una cita real guardada localmente —
 * riesgo de doble reserva. Ahora el sitio nunca "gana" por si solo: se une con lo local y se
 * quita el duplicado, el mismo patron que ya se aplico en negocio.js#todasLasCitas.
 */
export async function horariosOcupados(fechaISO) {
  const delSitio = await ocupadosDelSitio();
  const local = ocupadosLocales();

  const porClave = new Map();
  for (const c of local) porClave.set(claveDeOcupado(c), c);
  for (const c of delSitio || []) porClave.set(claveDeOcupado(c), c); // el sitio trae el estado; gana si esta

  return [...porClave.values()].filter((c) => c.fecha === fechaISO);
}

/**
 * ¿Cabe una cita en ese hueco?
 * Devuelve { libre, choque, sugerencias } — las sugerencias son horas cercanas que sí caben.
 */
export async function verificarHorario(fechaISO, hora24, duracion = DURACION_POR_DEFECTO, contacto = '') {
  const inicio = aMinutos(hora24);
  if (inicio === null) return { libre: false, error: 'La hora no es válida. Usa el formato 24h, por ejemplo 16:00.' };

  // Una hora que ya pasó no se comprueba contra la agenda: no existe. Se corta aquí y no
  // se deja al criterio del modelo, que a las 23:00 llegó a ofrecer "hoy a las 3".
  if (yaPaso(fechaISO, hora24)) {
    const manana = sumarDias(hoyISO(), 1);
    return {
      libre: false,
      yaPaso: true,
      ahora: `${horaAhora()} del ${hoyISO()}`,
      nota: `Esa hora ya pasó: ahora son las ${horaAhora()}. Díselo y ofrécele otra hora de hoy más tarde, o el ${describirFecha(manana).texto} (${manana}).`,
    };
  }

  const dura = Number(duracion) || DURACION_POR_DEFECTO;
  const fin = inicio + dura;

  // Que el estudio esté abierto no lo comprobaba nadie: se llegaba a dar por buena una cita
  // a las 03:00, y una de 21:00 que termina a las 23:30 con el cierre a las 21:30. La
  // clienta se presentaba a una puerta cerrada.
  const { apertura, cierre } = horarioAtencion();
  if (inicio < apertura || fin > cierre) {
    return {
      libre: false,
      fueraDeHorario: true,
      horario: `${aHora(apertura)} a ${aHora(cierre)}`,
      nota:
        inicio < apertura
          ? `A esa hora el estudio todavía está cerrado. Se atiende de ${aHora(apertura)} a ${aHora(cierre)}.`
          : `Esa cita dura ${dura} minutos y terminaría a las ${aHora(fin)}, después del cierre (${aHora(cierre)}). Ofrécele empezar más temprano.`,
      sugerencias: sugerirHuecos(await horariosOcupados(fechaISO), inicio, dura, fechaISO),
    };
  }

  const ocupados = await horariosOcupados(fechaISO);

  const choque = ocupados.find((c) => {
    const oi = aMinutos(c.hora);
    if (oi === null) return false;
    return seSolapan(inicio, fin, oi, oi + (Number(c.duracion) || DURACION_POR_DEFECTO));
  });

  if (!choque) return { libre: true };

  // El choque es con la cita de la MISMA persona: no es que este ocupado, es que ya la
  // tiene reservada. Pasa cuando confirma dos veces seguidas.
  const mismaPersona = contacto && String(choque.contacto || '').replace(/\D/g, '') === String(contacto).replace(/\D/g, '');
  if (mismaPersona) return { libre: false, yaEsSuya: true, nombre: choque.nombre };

  return {
    libre: false,
    ocupadoDe: `${choque.hora} a ${aHora(aMinutos(choque.hora) + (Number(choque.duracion) || DURACION_POR_DEFECTO))}`,
    sugerencias: sugerirHuecos(ocupados, inicio, dura, fechaISO),
  };
}

/**
 * Busca huecos libres el mismo día, lo más cerca posible de la hora que pidió la clienta.
 * Se mueve en saltos de media hora dentro de un horario razonable de atención (8:00–20:00).
 */
function sugerirHuecos(ocupados, deseado, dura, fechaISO) {
  // El horario real manda: con un cierre demasiado temprano el sistema no encontraba
  // ningun hueco y la clienta se quedaba sin alternativas que ofrecerle.
  const APERTURA = aMinutos(obtenerAjuste('hora_apertura', '08:00')) ?? 8 * 60;
  const CIERRE = aMinutos(obtenerAjuste('hora_cierre', '21:30')) ?? 21 * 60 + 30;
  // Si el hueco es para hoy, el suelo no es la hora de apertura sino la hora que es ahora:
  // ofrecerle las 10 de la mañana a las 4 de la tarde es peor que no ofrecerle nada.
  const esHoy = fechaISO === hoyISO();
  const ahora = esHoy ? aMinutos(horaAhora()) ?? 0 : 0;

  const cabe = (inicio) =>
    inicio >= Math.max(APERTURA, ahora) &&
    inicio + dura <= CIERRE &&
    !ocupados.some((c) => {
      const oi = aMinutos(c.hora);
      return oi !== null && seSolapan(inicio, inicio + dura, oi, oi + (Number(c.duracion) || DURACION_POR_DEFECTO));
    });

  const encontrados = [];
  for (let salto = 30; salto <= 8 * 60 && encontrados.length < 3; salto += 30) {
    for (const candidato of [deseado - salto, deseado + salto]) {
      if (cabe(candidato) && !encontrados.includes(aHora(candidato))) {
        encontrados.push(aHora(candidato));
        if (encontrados.length >= 3) break;
      }
    }
  }
  return encontrados;
}

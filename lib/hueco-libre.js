import { db } from './db-citas.js';
import {
  DURACION_POR_DEFECTO,
  aIntervalos,
  aMinutos,
  chocaConAlguno,
  sugerirCercanas,
} from './huecos.js';

/**
 * ¿Está libre ese hueco de la agenda?
 *
 * Existe porque faltaba: el formulario de la web insertaba la cita sin
 * comprobar nada. Dos clientas podían reservar la misma hora y las dos recibían
 * "cita anotada" y su correo de confirmación. El único camino que sí validaba
 * era el del bot de WhatsApp — y el bot llama a este mismo endpoint, así que la
 * validación quedaba del lado equivocado de la puerta.
 *
 * Se comprueba en dos capas, y las dos hacen falta:
 *  1. Acá, antes de insertar: da un mensaje entendible y ofrece alternativas.
 *  2. En la base, con un índice único (ver la migración
 *     20260825_citas_hueco_unico.sql): es lo único que gana una carrera entre
 *     dos reservas simultáneas, porque entre el SELECT y el INSERT de acá
 *     siempre cabe otra petición.
 *
 * La aritmética de intervalos vive en huecos.js, sin base de datos, para poder
 * probarla sola.
 */

/** Las citas de ese día que de verdad ocupan un hueco, como intervalos. */
export async function ocupadosDelDia(fechaISO) {
  const { data, error } = await db()
    .from('citas')
    .select('id, fecha_iso, hora24, duracion_min, estado, nombre')
    .eq('fecha_iso', fechaISO);
  if (error) throw error;
  return aIntervalos(data || []);
}

/**
 * Devuelve `{ libre: true }` o `{ libre: false, motivo, alternativas }`.
 * Compara INTERVALOS, no horas de inicio: una cita de 90 minutos a las 10:00
 * tiene que bloquear las 10:30, aunque nadie haya reservado "las 10:30".
 */
export async function huecoLibre({ fechaISO, hora24, duracionMin }) {
  const inicio = aMinutos(hora24);
  if (inicio === null) return { libre: false, motivo: 'La hora no es válida.' };

  const duracion = Number(duracionMin) || DURACION_POR_DEFECTO;
  const candidato = { inicio, fin: inicio + duracion };

  let ocupados;
  try {
    ocupados = await ocupadosDelDia(fechaISO);
  } catch (err) {
    // Fail-closed: si no se puede leer la agenda, NO se anota a ciegas. Una
    // reserva perdida se recupera con una llamada; dos clientas a la misma hora
    // en el local, no.
    return {
      libre: false,
      motivo: 'No pudimos comprobar la agenda en este momento. Escribinos por WhatsApp y te anotamos.',
      error: err.message,
    };
  }

  if (!chocaConAlguno(candidato, ocupados)) return { libre: true };

  return {
    libre: false,
    motivo: 'Esa hora ya está tomada.',
    alternativas: sugerirCercanas(ocupados, inicio, duracion),
  };
}

export { esChoqueDeHorario } from './huecos.js';

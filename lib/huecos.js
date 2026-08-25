/**
 * Aritmética de huecos de agenda. Sin base de datos y sin red a propósito:
 * es la parte que decide si dos citas se pisan, y tiene que poder probarse
 * sola, sin Supabase de por medio.
 */

/** Estados que LIBERAN el hueco. Mismos que en lib/agenda-ocupados.js. */
export const LIBERAN = new Set(['rechazada', 'reprogramar']);
export const DURACION_POR_DEFECTO = 60;

export const aMinutos = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

export const aHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * Dos intervalos se pisan si uno empieza antes de que el otro termine.
 * Pegados no cuenta: una cita que termina a las 11:00 y otra que empieza a las
 * 11:00 conviven bien.
 */
export const seSolapan = (a, b) => a.inicio < b.fin && b.inicio < a.fin;

export const chocaConAlguno = (candidato, ocupados = []) =>
  ocupados.some((o) => seSolapan(candidato, o));

/** Convierte filas de la base en intervalos, descartando las que liberan el hueco. */
export function aIntervalos(filas = []) {
  return filas
    .filter((c) => !LIBERAN.has(c.estado || 'en_proceso') && c.hora24)
    .map((c) => {
      const inicio = aMinutos(c.hora24);
      if (inicio === null) return null;
      return {
        id: c.id,
        nombre: c.nombre,
        inicio,
        fin: inicio + (Number(c.duracion_min ?? c.duracionMin) || DURACION_POR_DEFECTO),
      };
    })
    .filter(Boolean);
}

/** Tres horas cercanas que sí están libres, para no dejar a la clienta sin salida. */
export function sugerirCercanas(ocupados, inicioDeseado, duracion, { apertura = 8 * 60, cierre = 20 * 60, paso = 30 } = {}) {
  const libres = [];
  for (let t = apertura; t + duracion <= cierre; t += paso) {
    if (!chocaConAlguno({ inicio: t, fin: t + duracion }, ocupados)) libres.push(t);
  }

  return libres
    .sort((a, b) => Math.abs(a - inicioDeseado) - Math.abs(b - inicioDeseado))
    .slice(0, 3)
    .sort((a, b) => a - b)
    .map(aHHMM);
}

/** ¿El error de Supabase es "ya existe una cita en ese hueco"? */
export const esChoqueDeHorario = (err) =>
  err?.code === '23505' || /duplicate key|unique constraint/i.test(err?.message || '');

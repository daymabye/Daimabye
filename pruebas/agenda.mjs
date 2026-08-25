// Que no se pueda vender dos veces el mismo turno.
//
// Es la comprobación que faltaba: el formulario de la web insertaba sin mirar
// la agenda, así que dos clientas podían reservar la misma hora y las dos
// recibían su correo de confirmación. Se corre con: node pruebas/agenda.mjs
import {
  aMinutos,
  seSolapan,
  chocaConAlguno,
  sugerirCercanas,
  esChoqueDeHorario,
} from '../lib/huecos.js';

let fallos = 0;
let pasos = 0;
const comprobar = (etiqueta, real, esperado) => {
  pasos += 1;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    fallos += 1;
    console.log(`  FALLO  ${etiqueta}\n         esperaba ${b}\n         obtuvo   ${a}`);
  } else {
    console.log(`  ok  ${etiqueta} = ${a}`);
  }
};

const hueco = (hhmm, duracion) => ({ inicio: aMinutos(hhmm), fin: aMinutos(hhmm) + duracion });

console.log('\nLEER LA HORA');
comprobar('09:30 son 570 minutos', aMinutos('09:30'), 570);
comprobar('una hora vacía no es válida', aMinutos(''), null);
comprobar('una hora inventada no es válida', aMinutos('mediodía'), null);

console.log('\nDOS TURNOS QUE SE PISAN');
const deDiez = hueco('10:00', 60);
comprobar('el mismo turno choca', seSolapan(deDiez, hueco('10:00', 60)), true);
comprobar('empezar en medio choca', seSolapan(deDiez, hueco('10:30', 60)), true);
comprobar('terminar en medio choca', seSolapan(deDiez, hueco('09:30', 60)), true);
comprobar('uno que envuelve al otro choca', seSolapan(deDiez, hueco('09:00', 180)), true);
comprobar('pegado justo al final NO choca', seSolapan(deDiez, hueco('11:00', 60)), false);
comprobar('pegado justo al principio NO choca', seSolapan(deDiez, hueco('09:00', 60)), false);
comprobar('lejos no choca', seSolapan(deDiez, hueco('15:00', 60)), false);

console.log('\nUNA SESIÓN LARGA BLOQUEA LO QUE PISA');
// Este era el error de fondo: mirar solo la hora de INICIO. Una sesión de 90
// minutos a las 10:00 termina a las 11:30, así que las 10:30 y las 11:00 están
// ocupadas aunque nadie haya reservado "las 10:30".
const larga = [hueco('10:00', 90)];
comprobar('las 10:30 están ocupadas', chocaConAlguno(hueco('10:30', 60), larga), true);
comprobar('las 11:00 están ocupadas', chocaConAlguno(hueco('11:00', 60), larga), true);
comprobar('las 11:30 ya están libres', chocaConAlguno(hueco('11:30', 60), larga), false);
comprobar('las 09:00 están libres', chocaConAlguno(hueco('09:00', 60), larga), false);

console.log('\nUNA AGENDA CON VARIAS CITAS');
const agenda = [hueco('09:00', 60), hueco('11:00', 90), hueco('15:00', 60)];
comprobar('10:00 libre (entre las dos)', chocaConAlguno(hueco('10:00', 60), agenda), false);
comprobar('12:00 ocupada (la de 11:00 dura 90)', chocaConAlguno(hueco('12:00', 60), agenda), true);
comprobar('12:30 ya libre', chocaConAlguno(hueco('12:30', 60), agenda), false);
comprobar('sin citas, todo libre', chocaConAlguno(hueco('10:00', 60), []), false);

console.log('\nSE OFRECEN ALTERNATIVAS, NO UN "NO"');
const sugeridas = sugerirCercanas(agenda, aMinutos('11:00'), 60);
comprobar('sugiere tres horas', sugeridas.length, 3);
comprobar('ninguna sugerida choca',
  sugeridas.every((h) => !chocaConAlguno(hueco(h, 60), agenda)), true);
comprobar('vienen en orden', [...sugeridas].sort().join() === sugeridas.join(), true);

const agendaLlena = [];
for (let h = 8; h < 20; h += 1) agendaLlena.push(hueco(`${String(h).padStart(2, '0')}:00`, 60));
comprobar('con el día lleno no inventa huecos', sugerirCercanas(agendaLlena, aMinutos('10:00'), 60), []);

console.log('\nRECONOCER EL CHOQUE QUE DEVUELVE LA BASE');
comprobar('reconoce el código de Postgres', esChoqueDeHorario({ code: '23505' }), true);
comprobar('reconoce el texto', esChoqueDeHorario({ message: 'duplicate key value violates unique constraint' }), true);
comprobar('no confunde otro error', esChoqueDeHorario({ code: '42P01', message: 'relation does not exist' }), false);
comprobar('no revienta con null', esChoqueDeHorario(null), false);

console.log('\n' + (fallos === 0 ? 'TODO BIEN' : 'HAY FALLOS') + `: ${pasos - fallos}/${pasos} comprobaciones\n`);
process.exit(fallos === 0 ? 0 : 1);

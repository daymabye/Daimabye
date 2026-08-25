import 'dotenv/config';
import express from 'express';

process.setMaxListeners(30);

// Sin esto, una promesa rechazada en cualquier rincon tumba el proceso entero y la
// atencion se cae hasta que pm2 lo levante. Se registra y se sigue.
process.on('unhandledRejection', (motivo) => {
  console.error('[daima-whatsapp] promesa rechazada sin capturar:', motivo?.message || motivo);
});
process.on('uncaughtException', (err) => {
  console.error('[daima-whatsapp] excepcion sin capturar:', err?.message || err);
  console.error(err?.stack);
});

import {
  estado,
  iniciar,
  solicitarCodigo,
  enviarMensaje,
  cerrarSesion,
  estadoDeEnvios,
} from './baileys.js';
import {
  listarConversaciones,
  listarMensajes,
  marcarLeido,
  fijarModo,
  listarCitas,
  obtenerUbicacion,
  obtenerTelefono,
} from './db.js';
import {
  botActivo,
  fijarAjuste,
  listarPrecios,
  fijarPrecio,
  listarInstrucciones,
  agregarInstruccion,
  borrarInstruccion,
  atiendeDomicilio,
  ubicacionLocal,
  obtenerAjuste,
} from './config.js';
import { resumenConsumo } from './limites.js';
import { recordatoriosActivos, fijarRecordatorios, horaDelResumen, revisarAhora } from './recordatorios.js';
import { resumirConversacion } from './resumen.js';
import { fichaDe, etiquetaDe } from './clientas.js';
import { enviarCorreo, correoConfigurado, diagnosticoCorreo } from './correo.js';
import { sincronizarCatalogo } from './catalog-sync.js';

const app = express();
app.use(express.json());

if (process.env.DAIMA_CATALOG_URL && process.env.DAIMA_CATALOG_TOKEN) {
  sincronizarCatalogo().then((r) => console.log('[catalogo] sync inicial', r)).catch((e) => console.error('[catalogo] sync inicial falló', e.message));
}

app.get('/', (req, res) => res.json({ ok: true, servicio: 'daima-whatsapp' }));

// Todo lo demas exige el token interno compartido con daima-web. Nunca lo toca el navegador.
app.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!process.env.WHATSAPP_INTERNAL_TOKEN || token !== process.env.WHATSAPP_INTERNAL_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
});

app.get('/estado', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // Se incluye el estado de los envios: si la proteccion antiban esta bloqueando, el
  // sintoma es que el bot deja de contestar sin decir nada, y hay que poder verlo.
  res.json({ ...estado, envios: estadoDeEnvios() });
});

app.post('/pair', async (req, res) => {
  try {
    const numero = String(req.body?.numero || process.env.WHATSAPP_NUMBER || '');
    if (!numero) return res.status(400).json({ error: 'Falta el numero' });
    const codigo = await solicitarCodigo(numero);
    res.json({ ok: true, codigo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/logout', async (req, res) => {
  try {
    await cerrarSesion();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/conversaciones', (req, res) => {
  // Cada chat lleva su etiqueta: es lo primero que Daima necesita saber antes de contestar,
  // porque no se le habla igual a quien viene por primera vez que a la de siempre.
  const conversaciones = listarConversaciones().map((c) => {
    const f = fichaDe(c.telefono);
    return { ...c, clienta: f?.visitas ? { ...etiquetaDe(f), visitas: f.visitas } : null };
  });
  res.json({ conversaciones });
});

// El identificador de una conversacion es su JID completo (puede ser `...@lid`),
// por eso viaja en el cuerpo o codificado en la URL, no como un numero suelto.
app.get('/conversaciones/:jid/mensajes', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const mensajes = listarMensajes(jid);
  marcarLeido(jid);
  res.json({ mensajes });
});

app.post('/conversaciones/:jid/mensajes', async (req, res) => {
  try {
    const jid = decodeURIComponent(req.params.jid);
    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ error: 'Falta el texto' });
    // La admin escribe manualmente: esta conversacion pasa a modo manual para que
    // el asistente automatico no le siga hablando a la clienta a la vez que ella.
    fijarModo(jid, 'manual');
    await enviarMensaje(jid, texto);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /conversaciones/:jid/ficha — lo que Daima necesita antes de contestar.
 *
 * Junta las dos cosas que no se ven leyendo el chat por encima: donde esta la clienta
 * (imprescindible para calcular el pasaje si es a domicilio) y un resumen de que quiere.
 */
app.get('/conversaciones/:jid/ficha', async (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const ubicacion = obtenerUbicacion(jid);
  // El resumen puede tardar unos segundos; si falla, la ficha sale igual con la ubicacion.
  const resumen = await resumirConversacion(jid, { forzar: req.query.forzar === '1' }).catch(() => null);
  const ficha = fichaDe(obtenerTelefono(jid));
  res.json({
    resumen,
    clienta: ficha?.visitas
      ? {
          ...etiquetaDe(ficha),
          visitas: ficha.visitas,
          ultimaCita: ficha.ultima_cita,
          ultimoServicio: ficha.ultimo_servicio,
          notas: ficha.notas || '',
        }
      : null,
    ubicacion: ubicacion && {
      lat: ubicacion.lat,
      lon: ubicacion.lon,
      lugar: ubicacion.lugar,
      cuando: ubicacion.ubicacion_en,
      mapa: `https://www.google.com/maps/search/?api=1&query=${ubicacion.lat},${ubicacion.lon}`,
    },
  });
});

app.post('/conversaciones/:jid/modo', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const modo = req.body?.modo === 'manual' ? 'manual' : 'auto';
  fijarModo(jid, modo);
  res.json({ ok: true, modo });
});

/**
 * POST /notificar — aviso puntual a una clienta  { destino, texto }
 *
 * Lo usa el panel cuando Daima confirma o rechaza una cita. A diferencia de escribir desde
 * la bandeja, esto NO pasa la conversacion a manual: es un aviso del sistema, y el bot debe
 * seguir atendiendo a esa clienta con normalidad.
 */
app.post('/notificar', async (req, res) => {
  try {
    const destino = String(req.body?.destino || '').trim();
    const texto = String(req.body?.texto || '').trim();
    if (!destino || !texto) return res.status(400).json({ error: 'Falta el destino o el texto' });
    await enviarMensaje(destino, texto);
    res.json({ ok: true });
  } catch (err) {
    console.error('[notificar] no se pudo enviar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /correo — envia un correo por Brevo desde la IP FIJA de este VPS.
 *
 * La web (Vercel) no puede hablar con Brevo directamente: sus IPs cambian en cada
 * peticion y Brevo solo acepta IPs autorizadas. Por eso delega aqui.
 * Cuerpo: { para, asunto, html }  ->  { ok, motivo }
 *
 * Nunca devuelve 500 por un correo rechazado: responde 200 con ok:false y el motivo,
 * para que la web pueda avisarle a la clienta en vez de romperse.
 */
app.post('/correo', async (req, res) => {
  const para = String(req.body?.para || '').trim();
  const asunto = String(req.body?.asunto || '').trim();
  const html = String(req.body?.html || '');
  if (!para || !asunto || !html) {
    return res.status(400).json({ ok: false, motivo: 'faltan para, asunto o html' });
  }
  const r = await enviarCorreo({ para, asunto, html });
  res.json(r);
});

// Diagnostico rapido: dice si el servidor puede enviar correo, sin mandar ninguno.
app.get('/correo/estado', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(diagnosticoCorreo());
});

/* ---------- Configuracion editable desde el panel web ---------- */

app.get('/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    botActivo: botActivo(),
    precios: listarPrecios(),
    instrucciones: listarInstrucciones(),
    citas: listarCitas(20),
    consumo: resumenConsumo(),
    domicilio: atiendeDomicilio(),
    local: ubicacionLocal(),
    recordatorios: recordatoriosActivos(),
    horaResumen: horaDelResumen(),
    horario: { apertura: obtenerAjuste('hora_apertura', '08:00'), cierre: obtenerAjuste('hora_cierre', '21:30') },
  });
});

app.post('/config/recordatorios', (req, res) => {
  fijarRecordatorios(Boolean(req.body?.activo));
  res.json({ ok: true, recordatorios: recordatoriosActivos() });
});

// Disparo manual: util cuando Daima acaba de confirmar citas y no quiere esperar al ciclo.
app.post('/config/recordatorios/ahora', (req, res) => {
  revisarAhora({ forzarHorario: true }).catch((e) => console.error('[server]', e.message));
  res.json({ ok: true });
});

app.post('/config/domicilio', (req, res) => {
  fijarAjuste('atiende_domicilio', req.body?.activo ? '1' : '0');
  res.json({ ok: true, domicilio: atiendeDomicilio() });
});

app.post('/config/bot', (req, res) => {
  fijarAjuste('bot_activo', req.body?.activo ? '1' : '0');
  res.json({ ok: true, botActivo: botActivo() });
});

app.post('/config/precio', (req, res) => {
  const clave = String(req.body?.clave || '').trim();
  const precio = Number.parseFloat(req.body?.precio);
  if (!clave) return res.status(400).json({ error: 'Falta el servicio' });
  if (!Number.isFinite(precio) || precio < 0) return res.status(400).json({ error: 'Precio no válido' });
  if (!fijarPrecio(clave, precio)) return res.status(404).json({ error: 'Ese servicio no existe' });
  res.json({ ok: true, precios: listarPrecios() });
});

app.post('/config/regla', (req, res) => {
  const texto = String(req.body?.texto || '').trim();
  if (!texto) return res.status(400).json({ error: 'Escribe la regla' });
  if (texto.length > 400) return res.status(400).json({ error: 'La regla es demasiado larga' });
  agregarInstruccion(texto);
  res.json({ ok: true, instrucciones: listarInstrucciones() });
});

app.delete('/config/regla/:id', (req, res) => {
  borrarInstruccion(Number.parseInt(req.params.id, 10));
  res.json({ ok: true, instrucciones: listarInstrucciones() });
});

const PORT = process.env.PORT || 4600;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[daima-whatsapp] API interna escuchando en 127.0.0.1:${PORT}`);
});

iniciar().catch((err) => {
  console.error('[daima-whatsapp] fallo fatal iniciando WhatsApp:', err);
  process.exit(1);
});

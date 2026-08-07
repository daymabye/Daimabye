/**
 * Envío de correos. Cuatro caminos, se usa el primero que esté configurado:
 *
 *  1. RELAY EN EL VPS (WHATSAPP_API_URL + WHATSAPP_API_TOKEN + CORREO_RELAY=1).
 *     ES EL MODO EN USO. Ver más abajo por qué.
 *  2. BREVO_SMTP_* → SMTP de Brevo directo. NO FUNCIONA DESDE VERCEL (ver abajo).
 *  3. GMAIL_USER + GMAIL_APP_PASSWORD → SMTP de Gmail. Sí funciona desde Vercel (Gmail no
 *     restringe por IP), pero exige contraseña de aplicación y ata el correo del negocio a
 *     una cuenta personal de Google.
 *  4. RESEND_API_KEY → API HTTP. Tampoco restringe por IP, pero SIN UN DOMINIO VERIFICADO
 *     solo deja escribir al titular de la cuenta. Era exactamente el problema original:
 *     las clientas no recibían absolutamente nada y solo llegaban los correos a Carlos.
 *
 * POR QUÉ EL RELAY (esto costó media mañana de depuración, no lo deshagas sin leer)
 * --------------------------------------------------------------------------------
 * Brevo tiene una protección de cuenta que solo permite enviar desde IPs autorizadas.
 * Vercel ejecuta cada petición en un servidor distinto, con una IP distinta y cambiante:
 * no hay ninguna IP que se pueda autorizar, así que el envío fallaba SIEMPRE con
 * `525 5.7.1 Unauthorized IP address`. El VPS sí tiene IP fija, se autoriza una vez y
 * queda resuelto para siempre. Por eso la web ya no habla con Brevo: le pide el envío al
 * VPS por `POST /correo`.
 *
 * Si algún día se compra un dominio propio, lo correcto es volver a Resend con el dominio
 * verificado: es API HTTP (sin problema de IPs), va directo desde Vercel y además alinea
 * SPF/DKIM/DMARC, que es lo que de verdad mantiene los correos fuera de spam.
 *
 * Si no hay nada configurado, `enviarCorreo` no hace nada y devuelve false. La reserva se guarda
 * igual — que falle el correo nunca debe costarle una cita al negocio.
 */

const MARCA = {
  bg: '#FCFBFA', texto: '#2D2926', suave: '#7A7571',
  acento: '#B59C82', borde: '#EBE6E0',
};

/**
 * Token del API interno del VPS.
 *
 * El nombre cambia según dónde se mire: en Vercel la variable histórica es
 * WHATSAPP_API_TOKEN (la usan lib/whatsapp.js y api/agenda.js) y en el .env del VPS se
 * llama WHATSAPP_INTERNAL_TOKEN. Se aceptan las dos, porque usar solo una hacía que el
 * relay se desactivara en silencio y el correo cayera al camino viejo de Brevo.
 */
function tokenRelay() {
  return process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_INTERNAL_TOKEN || '';
}

/** ¿Está configurado el relay del VPS? */
function relayDisponible() {
  return Boolean(
    process.env.CORREO_RELAY === '1' &&
    process.env.WHATSAPP_API_URL &&
    tokenRelay()
  );
}

export function correoConfigurado() {
  return Boolean(
    relayDisponible() ||
    (process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_KEY) ||
    (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
    process.env.RESEND_API_KEY
  );
}

/** Nombre del proveedor activo — se usa en los logs y en el panel para saber por dónde salió. */
export function proveedorCorreo() {
  if (relayDisponible()) return 'relay-vps';
  if (process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_KEY) return 'brevo';
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'gmail';
  if (process.env.RESEND_API_KEY) return 'resend';
  return 'ninguno';
}

/**
 * Devuelve { ok, motivo } — nunca lanza.
 *
 * Antes devolvia true/false y quien llamaba lo ignoraba, asi que un correo rechazado se
 * perdia en silencio: la reserva respondia 201, el bot le decia a la clienta "te llega la
 * confirmacion" y no llegaba nada. El motivo se guarda con la cita para que se vea en el
 * panel, en lugar de tener que ir a buscar los logs del servidor.
 */
export async function enviarCorreo({ para, asunto, html }) {
  if (!para) return { ok: false, motivo: 'sin destinatario' };
  if (relayDisponible()) {
    return enviarPorRelay({ para, asunto, html });
  }
  if (process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_KEY) {
    return enviarPorBrevo({ para, asunto, html });
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return enviarPorGmail({ para, asunto, html });
  }
  if (process.env.RESEND_API_KEY) {
    return enviarPorResend({ para, asunto, html });
  }
  return { ok: false, motivo: 'no hay ningun proveedor de correo configurado' };
}

/**
 * Pide el envío al VPS, que sí tiene IP fija autorizada en Brevo.
 *
 * Nunca lanza y nunca deja la petición colgada: si el VPS no responde en 15 s se corta y
 * se devuelve el motivo. Una reserva no puede quedarse esperando por un correo.
 */
async function enviarPorRelay({ para, asunto, html }) {
  const base = String(process.env.WHATSAPP_API_URL).replace(/\/+$/, '');
  const corte = AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined;
  try {
    const r = await fetch(`${base}/correo`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenRelay()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ para, asunto, html }),
      signal: corte,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, motivo: d?.motivo || `el servidor de correo respondio ${r.status}` };
    }
    // El VPS ya devuelve { ok, motivo } con el motivo traducido a algo accionable.
    return { ok: Boolean(d?.ok), motivo: d?.motivo || '' };
  } catch (err) {
    const crudo = err?.message || String(err);
    console.error('[email] no se pudo contactar al servidor de correo:', crudo);
    return { ok: false, motivo: ('No se pudo contactar al servidor de correo del VPS: ' + crudo).slice(0, 300) };
  }
}

/**
 * Brevo (antes Sendinblue) por SMTP.
 *
 * OJO: desde Vercel esto NO funciona — sus IPs cambian y Brevo las bloquea. Se conserva
 * por si algún día la web corre en un sitio con IP fija. El camino real es enviarPorRelay.
 *
 * BREVO_SMTP_USER es el "login" que da Brevo en SMTP & API → suele verse como
 * `9a1b2c001@smtp-brevo.com`, NO es el correo con el que te registraste.
 * BREVO_SMTP_KEY es la clave SMTP (empieza por `xsmtpsib-`), tampoco es la del panel.
 *
 * El remitente de MAIL_FROM tiene que estar verificado en Brevo (Senders → Add a sender,
 * te llega un correo de confirmación). Si no lo está, Brevo rechaza el envío con 403 y
 * abajo se traduce el motivo, para que en el panel se lea qué hacer en vez de un código.
 */
async function enviarPorBrevo({ para, asunto, html }) {
  try {
    const { default: nodemailer } = await import('nodemailer');
    const transporte = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false, // STARTTLS: el 587 arranca en claro y sube a TLS. Con `true` no conecta.
      auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: String(process.env.BREVO_SMTP_KEY).trim(),
      },
    });
    await transporte.sendMail({
      from: process.env.MAIL_FROM || `Daima Belleza Studio <${process.env.BREVO_SMTP_USER}>`,
      to: para,
      subject: asunto,
      html,
    });
    return { ok: true };
  } catch (err) {
    const crudo = err?.message || String(err);
    console.error('[email] Brevo no pudo enviar:', crudo);
    // Traducción de los dos errores que de verdad ocurren, para que el panel diga qué hacer.
    let motivo;
    if (/535|authentication|credenciales/i.test(crudo)) {
      motivo = 'Brevo rechazo las credenciales. Revisa BREVO_SMTP_USER (el login xxxx@smtp-brevo.com) y BREVO_SMTP_KEY (la clave SMTP, empieza por xsmtpsib-).';
    } else if (/sender|not verified|403|unrecognised/i.test(crudo)) {
      motivo = 'El remitente de MAIL_FROM no esta verificado en Brevo. Agregalo en Brevo > Senders y confirma el correo que te llega.';
    } else {
      motivo = ('Brevo: ' + crudo).slice(0, 300);
    }
    return { ok: false, motivo };
  }
}

async function enviarPorGmail({ para, asunto, html }) {
  try {
    // Import dinámico: si algún día se envía por Resend, nodemailer ni se carga.
    const { default: nodemailer } = await import('nodemailer');
    const usuario = process.env.GMAIL_USER;
    const transporte = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: usuario,
        // Contraseña DE APLICACIÓN de 16 letras, no la del correo. Google no permite
        // la contraseña normal desde programas externos.
        pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s/g, ''),
      },
    });
    await transporte.sendMail({
      from: process.env.MAIL_FROM || `Daima Belleza Studio <${usuario}>`,
      to: para,
      subject: asunto,
      html,
    });
    return { ok: true };
  } catch (err) {
    const motivo = err?.message || String(err);
    console.error('[email] Gmail no pudo enviar:', motivo);
    return { ok: false, motivo: ('Gmail: ' + motivo).slice(0, 300) };
  }
}

async function enviarPorResend({ para, asunto, html }) {
  const remitente = process.env.MAIL_FROM || 'Daima Belleza <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remitente, to: [para], subject: asunto, html }),
    });
    if (!r.ok) {
      const cuerpo = (await r.text().catch(() => '')).slice(0, 300);
      console.error('[email] Resend respondio', r.status, cuerpo);
      // El 403 tipico de Resend sin dominio verificado: solo deja escribir al dueño de la
      // cuenta. Se traduce, porque el mensaje crudo no le dice nada a quien lea el panel.
      const motivo =
        r.status === 403
          ? 'Resend todavia no tiene un dominio verificado, asi que solo puede escribirle al dueño de la cuenta. Verifica un dominio en resend.com/domains, o configura GMAIL_USER y GMAIL_APP_PASSWORD.'
          : 'Resend respondio ' + r.status + ': ' + cuerpo;
      return { ok: false, motivo };
    }
    return { ok: true };
  } catch (err) {
    const motivo = err?.message || String(err);
    console.error('[email] no se pudo enviar:', motivo);
    return { ok: false, motivo: motivo.slice(0, 300) };
  }
}

/** Escapa texto que viene del formulario: nunca se inyecta HTML en un correo. */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function fechaBonita(iso) {
  if (!iso) return 'Por confirmar';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function plantilla({ titulo, entradilla, cita, cierre, destacado }) {
  const filas = [
    ['Servicio', cita.plan],
    ['Fecha', fechaBonita(cita.fecha)],
    ['Hora', cita.hora || 'Sin preferencia'],
    ['A nombre de', cita.nombre],
    ['WhatsApp', cita.telefono],
    ['Sector', cita.sector],
  ]
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `<tr>
        <td style="padding:8px 0;color:${MARCA.suave};font-size:14px">${esc(k)}</td>
        <td style="padding:8px 0;color:${MARCA.texto};font-size:14px;text-align:right"><strong>${esc(v)}</strong></td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html><html lang="es"><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${esc(titulo)}</title>
    </head><body style="margin:0;padding:24px;background:${MARCA.bg};
    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MARCA.texto}">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid ${MARCA.borde};border-radius:14px;overflow:hidden">
      <div style="padding:28px 28px 8px;text-align:center">
        <div style="font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:${MARCA.acento}">Daima Belleza Studio</div>
        <h1 style="margin:12px 0 0;font-size:22px;font-weight:600">${esc(titulo)}</h1>
      </div>
      <div style="padding:16px 28px 4px;color:${MARCA.suave};font-size:15px;line-height:1.6">${entradilla}</div>
      ${destacado ? `<div style="margin:16px 28px;padding:12px 16px;background:#F6F0E9;border-radius:10px;
          color:${MARCA.texto};font-size:14px;text-align:center">${destacado}</div>` : ''}
      <div style="padding:8px 28px 20px">
        <table style="width:100%;border-collapse:collapse">${filas}</table>
      </div>
      <div style="padding:0 28px 28px;color:${MARCA.suave};font-size:13px;line-height:1.6">${cierre}</div>
      <div style="padding:16px 28px;background:${MARCA.bg};border-top:1px solid ${MARCA.borde};
        text-align:center;color:${MARCA.suave};font-size:12px">
        Portoviejo, Ecuador · <a href="https://wa.me/593958757109" style="color:${MARCA.acento}">WhatsApp</a>
      </div>
    </div></body></html>`;
}

/** Aviso a la clienta: su solicitud entró, pero todavía no está confirmada. */
export function correoParaClienta(cita) {
  return {
    asunto: 'Recibimos tu solicitud de cita · Daima Belleza',
    html: plantilla({
      titulo: `¡Gracias, ${esc(cita.nombre.split(' ')[0])}!`,
      entradilla: 'Tu solicitud ya llegó y está <strong>en proceso de agendar</strong>. Daima la revisa y te confirma por WhatsApp o por este mismo correo.',
      destacado: 'Todavía no es una cita confirmada — te avisamos en cuanto lo esté.',
      cita,
      cierre: '¿Necesitas cambiar algo? Respóndenos por WhatsApp y lo ajustamos.',
    }),
  };
}

/** Aviso a la administradora, con enlace al panel. */
export function correoParaAdmin(cita, urlPanel) {
  return {
    asunto: `Nueva solicitud de cita: ${cita.nombre}`,
    html: plantilla({
      titulo: 'Nueva solicitud de cita',
      entradilla: `<strong>${esc(cita.nombre)}</strong> (${esc(cita.correo)}) quiere agendar.`,
      cita,
      cierre: `<a href="${esc(urlPanel)}" style="color:${MARCA.acento}"><strong>Abrir el panel para confirmarla &rarr;</strong></a>`,
    }),
  };
}

/** Confirmación final, cuando la administradora acepta. */
export function correoCitaConfirmada(cita) {
  return {
    asunto: '¡Tu cita está confirmada! · Daima Belleza',
    html: plantilla({
      titulo: '¡Tu cita está confirmada!',
      entradilla: `Listo, ${esc(cita.nombre.split(' ')[0])}. Daima te espera.`,
      destacado: 'Te recomendamos llegar con el cabello limpio y seco.',
      cita,
      cierre: 'Si necesitas reprogramar, escríbenos por WhatsApp con tiempo.',
    }),
  };
}

/** Aviso cuando no se puede tomar la cita. */
export function correoCitaReprogramar(cita) {
  return {
    asunto: 'Necesitamos mover tu cita · Daima Belleza',
    html: plantilla({
      titulo: 'Movamos tu cita',
      entradilla: `Hola ${esc(cita.nombre.split(' ')[0])}, necesitamos cambiar la hora de tu cita.`,
      cita,
      cierre: 'Escríbenos por WhatsApp y elegimos juntas otro horario que te sirva. Tu reserva sigue en pie.',
    }),
  };
}

export function correoCitaRechazada(cita) {
  return {
    asunto: 'Sobre tu solicitud de cita · Daima Belleza',
    html: plantilla({
      titulo: 'No pudimos tomar esa fecha',
      entradilla: `Hola ${esc(cita.nombre.split(' ')[0])}, lamentablemente esa fecha y hora ya no están disponibles.`,
      cita,
      cierre: 'Escríbenos por WhatsApp y buscamos juntas otro horario que te sirva.',
    }),
  };
}

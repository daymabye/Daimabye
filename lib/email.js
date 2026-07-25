/**
 * Envío de correos (Resend).
 *
 * Todo esto es OPCIONAL: si no hay RESEND_API_KEY configurada, `enviarCorreo` no hace nada y
 * devuelve false. La reserva se guarda igual — que falle el correo nunca debe costarle una cita
 * al negocio.
 */

const MARCA = {
  bg: '#FCFBFA', texto: '#2D2926', suave: '#7A7571',
  acento: '#B59C82', borde: '#EBE6E0',
};

export function correoConfigurado() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function enviarCorreo({ para, asunto, html }) {
  const clave = process.env.RESEND_API_KEY;
  if (!clave || !para) return false;

  const remitente = process.env.MAIL_FROM || 'Daima Belleza <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remitente, to: [para], subject: asunto, html }),
    });
    if (!r.ok) {
      console.error('[email] Resend respondió', r.status, (await r.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] no se pudo enviar:', err);
    return false;
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

  return `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:24px;background:${MARCA.bg};
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
        Portoviejo, Ecuador · <a href="https://wa.me/5930958757109" style="color:${MARCA.acento}">WhatsApp</a>
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

(function () {
  const root = document.getElementById('agenda-publica');
  if (!root) return;
  const fechaInput = root.querySelector('[name="fecha"]');
  const lista = root.querySelector('[data-libres]');
  const estado = root.querySelector('[data-estado]');
  const duracion = Number(root.dataset.duracion || 60);
  function hoyEcuador() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }
  async function cargar() {
    const fecha = fechaInput.value || hoyEcuador();
    fechaInput.value = fecha;
    estado.textContent = 'Consultando disponibilidad…';
    lista.innerHTML = '';
    try {
      const r = await fetch(`/api/disponibilidad?fecha=${encodeURIComponent(fecha)}&duracion=${duracion}`, { cache: 'no-store' });
      const data = await r.json();
      if (data.failClosed) {
        estado.textContent = data.mensaje || 'Agenda no disponible por ahora.';
        return;
      }
      const libres = data.libres || [];
      if (!libres.length) {
        estado.textContent = 'No hay horarios libres este día.';
        return;
      }
      estado.textContent = `${libres.length} horarios libres`;
      for (const h of libres) {
        const li = document.createElement('li');
        li.textContent = h;
        lista.appendChild(li);
      }
    } catch (err) {
      estado.textContent = 'No se pudo cargar la agenda.';
    }
  }
  fechaInput.min = hoyEcuador();
  if (!fechaInput.value) fechaInput.value = hoyEcuador();
  fechaInput.addEventListener('change', cargar);
  cargar();
})();

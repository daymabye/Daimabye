-- Una sola cita por hueco de la agenda.
--
-- Por qué: el formulario de la web insertaba sin comprobar disponibilidad, así
-- que dos clientas podían reservar la misma hora y las dos recibían su correo
-- de confirmación. El chequeo en la aplicación (lib/hueco-libre.js) da el
-- mensaje amable, pero entre el SELECT y el INSERT siempre cabe otra petición:
-- lo único que gana una carrera de verdad es un índice único en la base.
--
-- Es PARCIAL a propósito: las citas rechazadas o marcadas para reprogramar
-- liberan el hueco (mismos estados que LIBERAN en lib/agenda-ocupados.js), así
-- que no deben ocupar lugar en el índice. Sin el WHERE, una cita rechazada
-- bloquearía esa hora para siempre — exactamente el error que ya costó caro en
-- otro proyecto.

-- Antes de crear el índice hay que saber si ya existen duplicados. Si los hay,
-- la creación falla y hay que resolverlos a mano: no se borra nada solo.
DO $$
DECLARE
  duplicados INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicados FROM (
    SELECT fecha_iso, hora24
      FROM citas
     WHERE COALESCE(estado, 'en_proceso') NOT IN ('rechazada', 'reprogramar')
       AND hora24 IS NOT NULL
     GROUP BY fecha_iso, hora24
    HAVING COUNT(*) > 1
  ) AS d;

  IF duplicados > 0 THEN
    RAISE EXCEPTION
      'Hay % hueco(s) con más de una cita. Resolvelos antes de aplicar esta migración: SELECT fecha_iso, hora24, COUNT(*) FROM citas WHERE COALESCE(estado, ''en_proceso'') NOT IN (''rechazada'', ''reprogramar'') AND hora24 IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1;',
      duplicados;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS citas_hueco_unico
  ON citas (fecha_iso, hora24)
  WHERE COALESCE(estado, 'en_proceso') NOT IN ('rechazada', 'reprogramar')
    AND hora24 IS NOT NULL;

COMMENT ON INDEX citas_hueco_unico IS
  'Impide dos citas activas en la misma fecha y hora. Parcial: los estados rechazada y reprogramar liberan el hueco.';

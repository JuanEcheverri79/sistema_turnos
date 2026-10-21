const API_URL = "http://127.0.0.1:8000";

async function procesarRespuesta(respuesta, mensajePredeterminado) {
  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    const detalle = datos?.detail;
    let mensaje = mensajePredeterminado;

    if (typeof detalle === "string") {
      mensaje = detalle;
    } else if (Array.isArray(detalle)) {
      mensaje = detalle
        .map((item) =>
          typeof item?.msg === "string"
            ? item.msg
            : JSON.stringify(item)
        )
        .join(" | ");
    } else if (detalle && typeof detalle === "object") {
      mensaje = JSON.stringify(detalle);
    }

    throw new Error(mensaje);
  }

  return datos;
}

export async function consultarTurnos(sucursalId = 1) {
  const respuesta = await fetch(
    `${API_URL}/turnos/?sucursal_id=${sucursalId}`
  );

  return procesarRespuesta(
    respuesta,
    "No fue posible consultar los turnos."
  );
}

export async function llamarSiguiente(sucursalId, servicioId, modulo) {
  const parametros = new URLSearchParams({
    sucursal_id: String(sucursalId),
    servicio_id: String(servicioId),
    modulo: String(modulo),
  });

  const respuesta = await fetch(
    `${API_URL}/turnos/llamar-siguiente?${parametros.toString()}`,
    { method: "POST" }
  );

  return procesarRespuesta(
    respuesta,
    "No fue posible llamar al siguiente turno."
  );
}

export async function marcarAusente(turnoId) {
  const respuesta = await fetch(
    `${API_URL}/turnos/${turnoId}/ausente`,
    { method: "POST" }
  );

  return procesarRespuesta(
    respuesta,
    "No fue posible marcar el turno como ausente."
  );
}

export async function retenerTurno(turnoId, motivo) {
  const parametros = new URLSearchParams({
    motivo: motivo.trim(),
  });

  const respuesta = await fetch(
    `${API_URL}/turnos/${turnoId}/retener?${parametros.toString()}`,
    { method: "POST" }
  );

  return procesarRespuesta(
    respuesta,
    "No fue posible retener el turno."
  );
}

export async function reactivarTurno(turnoId) {
  const respuesta = await fetch(
    `${API_URL}/turnos/${turnoId}/reactivar`,
    { method: "POST" }
  );

  return procesarRespuesta(
    respuesta,
    "No fue posible reactivar el turno."
  );
}

export async function documentarTurno(
  turnoId,
  tipoTramite,
  observacion
) {
  const respuesta = await fetch(
    `${API_URL}/turnos/${turnoId}/documentar`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tipo_tramite: tipoTramite,
        observacion: observacion,
      }),
    }
  );

  return procesarRespuesta(
    respuesta,
    "No fue posible guardar la documentación."
  );
}

export async function finalizarTurno(turnoId) {
  const respuesta = await fetch(
    `${API_URL}/turnos/${turnoId}/finalizar`,
    { method: "POST" }
  );

  return procesarRespuesta(
    respuesta,
    "No fue posible finalizar el turno."
  );
}

export async function limpiarTodosLosTurnos() {
  const respuesta = await fetch(`${API_URL}/turnos/limpiar-todos`, {
    method: "DELETE",
  });

  return procesarRespuesta(
    respuesta,
    "No fue posible limpiar los turnos de prueba."
  );
}

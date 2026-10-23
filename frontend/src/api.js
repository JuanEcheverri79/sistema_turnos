
const API_URL = "http://127.0.0.1:8000";

// =====================================================
// CONFIGURACIÓN GENERAL
// =====================================================

function obtenerToken() {
  return sessionStorage.getItem("token_sesion");
}

function opcionesAutenticadas(opciones = {}) {
  const token = obtenerToken();
  const headers = new Headers(opciones.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return {
    ...opciones,
    headers,
  };
}

async function procesarRespuesta(
  respuesta,
  mensajePredeterminado,
) {
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
            : JSON.stringify(item),
        )
        .join(" | ");
    } else if (detalle && typeof detalle === "object") {
      mensaje = JSON.stringify(detalle);
    }

    throw new Error(mensaje);
  }

  return datos;
}

async function solicitar(
  ruta,
  opciones = {},
  mensajeError = "No fue posible completar la solicitud.",
) {
  let respuesta;

  try {
    respuesta = await fetch(
      `${API_URL}${ruta}`,
      opcionesAutenticadas(opciones),
    );
  } catch {
    throw new Error(
      "No fue posible conectar con el servidor. Verifica que el backend esté ejecutándose.",
    );
  }

  return procesarRespuesta(respuesta, mensajeError);
}

function opcionesJSON(metodo, datos) {
  return {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(datos),
  };
}

// =====================================================
// AUTENTICACIÓN
// Estas funciones requieren las rutas del backend.
// =====================================================


export async function iniciarSesion(usuario, contrasena) {
  const respuesta = await solicitar(
    "/auth/login",
    opcionesJSON("POST", {
      usuario: usuario.trim(),
      clave: contrasena,
    }),
    "No fue posible iniciar sesión.",
  );

  if (!respuesta.access_token) {
    throw new Error(
      "El servidor no devolvió el token de acceso.",
    );
  }

  sessionStorage.setItem(
    "token_sesion",
    respuesta.access_token,
  );

  sessionStorage.setItem(
    "usuario_sesion",
    JSON.stringify(respuesta.usuario || usuario.trim()),
  );

  return respuesta;
}


export function cerrarSesionLocal() {
  sessionStorage.removeItem("token_sesion");
  sessionStorage.removeItem("usuario_sesion");
}

export function obtenerUsuarioSesion() {
  try {
    const usuario = sessionStorage.getItem("usuario_sesion");
    return usuario ? JSON.parse(usuario) : null;
  } catch {
    return null;
  }
}

export function haySesionActiva() {
  return Boolean(obtenerToken());
}

export async function registrarCierreSesion(motivo) {
  return solicitar(
    "/auth/cerrar-sesion",
    opcionesJSON("POST", { motivo }),
    "No fue posible registrar el cierre de sesión.",
  );
}

// =====================================================
// CONSULTA Y GESTIÓN GENERAL DE TURNOS
// =====================================================

export async function consultarTurnos(
  sucursalId = 1,
  servicioId = null,
) {
  const parametros = new URLSearchParams({
    sucursal_id: String(sucursalId),
  });

  if (servicioId !== null && servicioId !== undefined) {
    parametros.set("servicio_id", String(servicioId));
  }

  return solicitar(
    `/turnos/?${parametros.toString()}`,
    { method: "GET" },
    "No fue posible consultar los turnos.",
  );
}

export async function llamarSiguiente(
  sucursalId,
  servicioId,
  modulo,
) {
  const parametros = new URLSearchParams({
    sucursal_id: String(sucursalId),
    servicio_id: String(servicioId),
    modulo: String(modulo),
  });

  return solicitar(
    `/turnos/llamar-siguiente?${parametros.toString()}`,
    { method: "POST" },
    "No fue posible llamar al siguiente turno.",
  );
}

export async function marcarAusente(turnoId) {
  return solicitar(
    `/turnos/${turnoId}/ausente`,
    { method: "POST" },
    "No fue posible marcar el turno como ausente.",
  );
}

export async function retenerTurno(turnoId, motivo) {
  const parametros = new URLSearchParams({
    motivo: motivo.trim(),
  });

  return solicitar(
    `/turnos/${turnoId}/retener?${parametros.toString()}`,
    { method: "POST" },
    "No fue posible retener el turno.",
  );
}

export async function reactivarTurno(turnoId) {
  return solicitar(
    `/turnos/${turnoId}/reactivar`,
    { method: "POST" },
    "No fue posible reactivar el turno.",
  );
}

export async function trasladarTurno(
  turnoId,
  nuevoServicioId,
  motivo = "",
) {
  return solicitar(
    `/turnos/${turnoId}/trasladar`,
    opcionesJSON("POST", {
      nuevo_servicio_id: Number(nuevoServicioId),
      motivo: motivo.trim(),
    }),
    "No fue posible trasladar el turno.",
  );
}

export async function documentarTurno(
  turnoId,
  tipoTramite,
  observacion,
) {
  return solicitar(
    `/turnos/${turnoId}/documentar`,
    opcionesJSON("POST", {
      tipo_tramite: tipoTramite,
      observacion,
    }),
    "No fue posible guardar la documentación.",
  );
}

export async function finalizarTurno(turnoId) {
  return solicitar(
    `/turnos/${turnoId}/finalizar`,
    { method: "POST" },
    "No fue posible finalizar el turno.",
  );
}

export async function limpiarTodosLosTurnos() {
  return solicitar(
    "/turnos/limpiar-todos",
    { method: "DELETE" },
    "No fue posible limpiar los turnos de prueba.",
  );
}

// =====================================================
// CATÁLOGOS
// =====================================================

export async function consultarServicios(sucursalId = 1) {
  const parametros = new URLSearchParams({
    sucursal_id: String(sucursalId),
  });

  return solicitar(
    `/turnos/catalogos/servicios?${parametros.toString()}`,
    { method: "GET" },
    "No fue posible consultar los servicios.",
  );
}

export async function consultarUbicaciones() {
  return solicitar(
    "/turnos/catalogos/ubicaciones",
    { method: "GET" },
    "No fue posible consultar las sucursales.",
  );
}

export async function consultarTiemposEspera(
  sucursalId = 1,
) {
  const parametros = new URLSearchParams({
    sucursal_id: String(sucursalId),
  });

  return solicitar(
    `/turnos/tiempos-espera?${parametros.toString()}`,
    { method: "GET" },
    "No fue posible consultar los tiempos de espera.",
  );
}

// =====================================================
// PANTALLA PÚBLICA
// Se conserva la ruta existente.
// =====================================================

export async function consultarPantallaPublica(
  sucursalId = 1,
) {
  const parametros = new URLSearchParams({
    sucursal_id: String(sucursalId),
  });

  return solicitar(
    `/turnos/pantalla-publica?${parametros.toString()}`,
    { method: "GET" },
    "No fue posible consultar la pantalla pública.",
  );
}

// =====================================================
// CONSULTA DE TURNO POR DOCUMENTO O CÓDIGO
// =====================================================

export async function consultarTurnoPorDocumento(
  tipoDocumento,
  numeroDocumento,
) {
  return solicitar(
    "/turnos/consultar-documento",
    opcionesJSON("POST", {
      tipo_documento: tipoDocumento,
      numero_documento: numeroDocumento.trim(),
    }),
    "No fue posible consultar el turno por documento.",
  );
}

export async function consultarTurnoPorCodigo(codigo) {
  const parametros = new URLSearchParams({
    codigo: codigo.trim().toUpperCase(),
  });

  return solicitar(
    `/turnos/consultar-codigo?${parametros.toString()}`,
    { method: "GET" },
    "No fue posible encontrar el turno.",
  );
}

export async function consultarHistorialTurno(codigo) {
  const parametros = new URLSearchParams({
    codigo: codigo.trim().toUpperCase(),
  });

  return solicitar(
    `/turnos/historial?${parametros.toString()}`,
    { method: "GET" },
    "No fue posible consultar el historial del turno.",
  );
}

// =====================================================
// CREACIÓN DE TURNOS PRESENCIALES DESDE EL MPC
// =====================================================

export async function crearTurnoMPC({
  sucursalId = 1,
  servicioId,
  prioridad = "Normal",
  tipoDocumento,
  numeroDocumento,
}) {
  return solicitar(
    "/turnos/",
    opcionesJSON("POST", {
      sucursal_id: sucursalId,
      servicio_id: servicioId,
      prioridad,
      origen: "MPC",
      tipo_documento: tipoDocumento,
      numero_documento: numeroDocumento.trim(),
    }),
    "No fue posible generar tu turno.",
  );
}

export async function cancelarTurnoMPC(turnoId) {
  return marcarAusente(turnoId);
}

// =====================================================
// RESERVAS VIRTUALES
// Se mantienen las funciones existentes.
// =====================================================

export async function reservarTurnoVirtual({
  sucursalId = 1,
  servicioId,
  tipoDocumento,
  numeroDocumento,
  celular,
  fechaHoraProgramada,
  aceptaTerminos,
}) {
  return solicitar(
    "/turnos/virtual/reservar",
    opcionesJSON("POST", {
      sucursal_id: sucursalId,
      servicio_id: servicioId,
      tipo_documento: tipoDocumento,
      numero_documento: numeroDocumento.trim(),
      celular: celular.trim(),
      fecha_hora_programada: fechaHoraProgramada,
      acepta_terminos: aceptaTerminos,
    }),
    "No fue posible reservar el turno virtual.",
  );
}

export async function activarTurnoVirtual(
  tipoDocumento,
  numeroDocumento,
) {
  return solicitar(
    "/turnos/virtual/activar",
    opcionesJSON("POST", {
      tipo_documento: tipoDocumento,
      numero_documento: numeroDocumento.trim(),
    }),
    "No fue posible activar el turno virtual.",
  );
}

export async function congelarTurnoVirtual(
  tipoDocumento,
  numeroDocumento,
) {
  return solicitar(
    "/turnos/virtual/congelar",
    opcionesJSON("POST", {
      tipo_documento: tipoDocumento,
      numero_documento: numeroDocumento.trim(),
    }),
    "No fue posible congelar el turno virtual.",
  );
}

export async function descongelarTurnoVirtual(
  tipoDocumento,
  numeroDocumento,
) {
  return solicitar(
    "/turnos/virtual/descongelar",
    opcionesJSON("POST", {
      tipo_documento: tipoDocumento,
      numero_documento: numeroDocumento.trim(),
    }),
    "No fue posible descongelar el turno virtual.",
  );
}

export async function cancelarReservaVirtual(
  tipoDocumento,
  numeroDocumento,
) {
  return solicitar(
    "/turnos/virtual/cancelar",
    opcionesJSON("POST", {
      tipo_documento: tipoDocumento,
      numero_documento: numeroDocumento.trim(),
    }),
    "No fue posible cancelar la reserva virtual.",
  );
}

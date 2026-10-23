
import { useCallback, useEffect, useState } from "react";
import "./App.css";
import Login from "./login.jsx";
import { haySesionActiva, cerrarSesionLocal } from "./api";

import {
  consultarTurnos,
  llamarSiguiente as llamarSiguienteAPI,
  marcarAusente,
  retenerTurno,
  reactivarTurno,
  documentarTurno,
  finalizarTurno,
  limpiarTodosLosTurnos,
  trasladarTurno,
  consultarServicios,
  consultarTiemposEspera,
} from "./api";

const SUCURSAL_ID = 1;
const MODULO = "3";

function nombreServicio(id) {
  const nombres = {
    1: "Caja",
    2: "Asesoría",
    3: "Información",
  };

  return nombres[id] || `Servicio ${id}`;
}

function estadoVisible(estado) {
  const nombres = {
    en_espera: "En espera",
    llamado: "Llamado",
    retenido: "Retenido",
    ausente: "Ausente",
    finalizado: "Finalizado",
  };

  return nombres[estado] || estado;
}

function obtenerMensajeError(err) {
  return typeof err?.message === "string"
    ? err.message
    : "Ocurrió un error inesperado.";
}

function App() {
  const [sesionActiva, setSesionActiva] = useState(() => haySesionActiva());
  const [turnos, setTurnos] = useState([]);
  const [turnoActual, setTurnoActual] = useState(null);
  const [servicioId, setServicioId] = useState("1");
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [turnoPorFinalizar, setTurnoPorFinalizar] = useState(null);
  const [tipoTramite, setTipoTramite] = useState("");
  const [observacion, setObservacion] = useState("");
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [limpiandoTurnos, setLimpiandoTurnos] = useState(false);

  const [servicios, setServicios] = useState([]);
  const [turnoPorTrasladar, setTurnoPorTrasladar] = useState(null);
  const [nuevoServicioId, setNuevoServicioId] = useState("");
  const [motivoTraslado, setMotivoTraslado] = useState("");

  const [tiemposEspera, setTiemposEspera] = useState([]);
  const [cargandoTiempos, setCargandoTiempos] = useState(false);
  const [errorTiempos, setErrorTiempos] = useState("");
  const [vista, setVista] = useState("inicio");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [mostrarMotivoSalida, setMostrarMotivoSalida] = useState(false);
  const [motivoSalida, setMotivoSalida] = useState("Almuerzo");
  const [tipoBusqueda, setTipoBusqueda] = useState("turno");
  const [codigoBusqueda, setCodigoBusqueda] = useState("");
  const [tipoDocumentoBusqueda, setTipoDocumentoBusqueda] = useState("CC");
  const [numeroDocumentoBusqueda, setNumeroDocumentoBusqueda] = useState("");
  const [resultadosConsulta, setResultadosConsulta] = useState([]);
  const [consultando, setConsultando] = useState(false);
  const [errorConsulta, setErrorConsulta] = useState("");

  // Un turno llamado en este módulo bloquea nuevos llamados.
  const turnoActivoModulo = turnos.find(
    (turno) =>
      turno.estado === "llamado" &&
      String(turno.modulo ?? "") === MODULO
  );

  const tieneTurnoActivo = Boolean(turnoActivoModulo);

  const cargarTurnos = useCallback(async () => {
    try {
      setError("");

      const datos = await consultarTurnos(SUCURSAL_ID);
      setTurnos(datos);

      setTurnoActual((actual) => {
        if (!actual) return null;

        return (
          datos.find(
            (turno) =>
              turno.id === actual.id &&
              turno.estado === "llamado"
          ) || null
        );
      });
    } catch (err) {
      setError(obtenerMensajeError(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!sesionActiva) {
      setCargando(false);
      return;
    }

    cargarTurnos();
  }, [cargarTurnos, sesionActiva]);

  const cargarTiemposEspera = useCallback(async () => {
    try {
      setCargandoTiempos(true);
      setErrorTiempos("");
      const datos = await consultarTiemposEspera(SUCURSAL_ID);
      setTiemposEspera(Array.isArray(datos) ? datos : []);
    } catch (err) {
      setErrorTiempos(obtenerMensajeError(err));
    } finally {
      setCargandoTiempos(false);
    }
  }, []);

  // Actualizar los tiempos al entrar y cada 30 segundos.
  useEffect(() => {
    if (!sesionActiva) {
      setTiemposEspera([]);
      return;
    }

    cargarTiemposEspera();
    const intervalo = window.setInterval(cargarTiemposEspera, 30000);
    return () => window.clearInterval(intervalo);
  }, [cargarTiemposEspera, sesionActiva]);

  useEffect(() => {
    if (!sesionActiva) return;

    async function cargarServicios() {
      try {
        const datos = await consultarServicios(SUCURSAL_ID);
        setServicios(datos);
      } catch (err) {
        setError(obtenerMensajeError(err));
      }
    }

    cargarServicios();
  }, [sesionActiva]);

  function manejarLogin() {
    setSesionActiva(true);
    setCargando(true);
  }

  function manejarCerrarSesion() {
    cerrarSesionLocal();
    setSesionActiva(false);
    setTurnos([]);
    setTurnoActual(null);
    setTiemposEspera([]);
    setError("");
    setErrorTiempos("");
    setMensaje("");
  }

  async function manejarLlamado() {
    // Validación preventiva del frontend.
    if (tieneTurnoActivo) {
      setError(
        `El módulo ${MODULO} ya tiene el turno ${turnoActivoModulo.codigo} llamado. Reténlo o resuelve su atención antes de llamar otro.`
      );
      setMensaje("");
      return;
    }

    try {
      setProcesando(true);
      setError("");
      setMensaje("");

      const turno = await llamarSiguienteAPI(
        SUCURSAL_ID,
        Number(servicioId),
        MODULO
      );

      setTurnoActual(turno);
      setMensaje(
        `Se llamó correctamente al turno ${turno.codigo}.`
      );

      await cargarTurnos();
    } catch (err) {
      setError(obtenerMensajeError(err));
      await cargarTurnos();
    } finally {
      setProcesando(false);
    }
  }

  async function manejarAccion(accion, turno) {
    let motivo = "";

    if (accion === "retener") {
      const respuesta = window.prompt(
        `¿Por qué deseas retener el turno ${turno.codigo}?`
      );

      if (respuesta === null) return;

      motivo = respuesta.trim();

      if (!motivo) {
        setError("Debes escribir el motivo de la retención.");
        setMensaje("");
        return;
      }
    }

    if (accion === "reactivar" && tieneTurnoActivo) {
      setError(
        `No puedes reactivar el turno ${turno.codigo} porque el módulo ${MODULO} ya tiene llamado el turno ${turnoActivoModulo.codigo}. Retén o resuelve primero ese turno.`
      );
      setMensaje("");
      return;
    }

    try {
      setProcesando(true);
      setError("");
      setMensaje("");

      if (accion === "ausente") {
        await marcarAusente(turno.id);
        setMensaje(
          `El turno ${turno.codigo} fue marcado como ausente.`
        );
      } else if (accion === "retener") {
        await retenerTurno(turno.id, motivo);
        setMensaje(
          `El turno ${turno.codigo} fue retenido.`
        );
      } else if (accion === "reactivar") {
        await reactivarTurno(turno.id);
        setMensaje(
          `El turno ${turno.codigo} fue reactivado.`
        );
      }

      await cargarTurnos();
    } catch (err) {
      setError(obtenerMensajeError(err));
      await cargarTurnos();
    } finally {
      setProcesando(false);
    }
  }

  function abrirFormularioTraslado(turno) {
    setError("");
    setMensaje("");
    setTurnoPorTrasladar(turno);
    setNuevoServicioId("");
    setMotivoTraslado("");
  }

  function cancelarTraslado() {
    if (procesando) return;

    setTurnoPorTrasladar(null);
    setNuevoServicioId("");
    setMotivoTraslado("");
    setError("");
  }

  async function confirmarTraslado(e) {
    e.preventDefault();

    if (!turnoPorTrasladar) return;

    if (!nuevoServicioId) {
      setError("Selecciona el servicio de destino.");
      return;
    }

    if (Number(nuevoServicioId) === turnoPorTrasladar.servicio_id) {
      setError("Selecciona un servicio diferente al actual.");
      return;
    }

    if (motivoTraslado.trim().length > 500) {
      setError("El motivo no puede superar 500 caracteres.");
      return;
    }

    try {
      setProcesando(true);
      setError("");
      setMensaje("");

      const codigo = turnoPorTrasladar.codigo;
      const destino = servicios.find(
        (servicio) => Number(servicio.id) === Number(nuevoServicioId)
      );

      await trasladarTurno(
        turnoPorTrasladar.id,
        nuevoServicioId,
        motivoTraslado
      );

      setTurnoPorTrasladar(null);
      setNuevoServicioId("");
      setMotivoTraslado("");

      setMensaje(
        `El turno ${codigo} fue trasladado a ${
          destino?.nombre || "el nuevo servicio"
        }. Se conservó su código.`
      );

      await cargarTurnos();
    } catch (err) {
      setError(obtenerMensajeError(err));
      await cargarTurnos();
    } finally {
      setProcesando(false);
    }
  }

  async function manejarLimpiarTurnos() {
    const confirmado = window.confirm(
      "ATENCIÓN: se eliminarán TODOS los turnos de prueba, sus historiales y sus documentaciones de la base de datos. Esta acción no se puede deshacer. ¿Deseas continuar?"
    );

    if (!confirmado) return;

    const confirmacionFinal = window.prompt(
      'Para confirmar el borrado escribe exactamente: ELIMINAR TURNOS'
    );

    if (confirmacionFinal !== "ELIMINAR TURNOS") {
      setMensaje("");
      setError("Limpieza cancelada. No se eliminó ningún turno.");
      return;
    }

    try {
      setLimpiandoTurnos(true);
      setProcesando(true);
      setError("");
      setMensaje("");

      const resultado = await limpiarTodosLosTurnos();

      setTurnos([]);
      setTurnoActual(null);
      setTurnoPorFinalizar(null);
      setTipoTramite("");
      setObservacion("");
      setMostrarConfirmacion(false);

      setMensaje(
        resultado?.mensaje ||
          "Se eliminaron los turnos, sus historiales y sus documentaciones."
      );

      await cargarTurnos();
    } catch (err) {
      setError(obtenerMensajeError(err));
      await cargarTurnos();
    } finally {
      setLimpiandoTurnos(false);
      setProcesando(false);
    }
  }

  function abrirFormularioFinalizacion(turno) {
    setError("");
    setMensaje("");
    setTurnoPorFinalizar(turno);
    setTipoTramite("");
    setObservacion("");
    setMostrarConfirmacion(false);
  }

  function cancelarFinalizacion() {
    if (procesando) return;

    setTurnoPorFinalizar(null);
    setTipoTramite("");
    setObservacion("");
    setMostrarConfirmacion(false);
    setError("");
  }

  function continuarAConfirmacion(e) {
    e.preventDefault();
    setError("");

    if (tipoTramite.trim().length < 2) {
      setError("Selecciona un tipo de trámite válido.");
      return;
    }

    if (observacion.trim().length < 3) {
      setError(
        "La observación debe tener al menos 3 caracteres."
      );
      return;
    }

    setMostrarConfirmacion(true);
  }

  async function confirmarFinalizacion() {
    if (!turnoPorFinalizar) return;

    try {
      setProcesando(true);
      setError("");
      setMensaje("");

      await documentarTurno(
        turnoPorFinalizar.id,
        tipoTramite.trim(),
        observacion.trim()
      );

      await finalizarTurno(turnoPorFinalizar.id);

      const codigo = turnoPorFinalizar.codigo;

      setTurnoActual((actual) =>
        actual?.id === turnoPorFinalizar.id ? null : actual
      );

      setTurnoPorFinalizar(null);
      setTipoTramite("");
      setObservacion("");
      setMostrarConfirmacion(false);

      setMensaje(
        `El turno ${codigo} fue documentado y finalizado correctamente.`
      );

      await cargarTurnos();
    } catch (err) {
      setError(obtenerMensajeError(err));
      await cargarTurnos();
    } finally {
      setProcesando(false);
    }
  }

  const enEspera = turnos.filter(
    (turno) => turno.estado === "en_espera"
  ).length;

  const enAtencion = turnos.filter(
    (turno) => turno.estado === "llamado"
  ).length;

  const retenidos = turnos.filter(
    (turno) => turno.estado === "retenido"
  ).length;

  if (!sesionActiva) {
    return <Login onLogin={manejarLogin} />;
  }

  return (
    <div className="aplicacion">
      <style>{`
        :root { --banco-amarillo:#ffdf00; --banco-verde:#ffdf00; --banco-verde-oscuro:#e0c700; --banco-texto:#191919; --banco-muted:#686d65; --banco-fondo:#f6f7f5; --banco-borde:#e5e7e1; }
        .aplicacion { min-height:100vh; background:var(--banco-fondo); color:var(--banco-texto); }
        .encabezado { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:16px clamp(16px,4vw,48px); background:#fff; border-bottom:1px solid var(--banco-borde); box-shadow:0 2px 8px rgba(0,0,0,.025); }
        .marca-banco { display:flex; flex-direction:column; align-items:flex-start; gap:8px; min-width:160px; }
        .marca-banco-logo { display:block; width:174px; max-width:100%; height:39px; object-fit:contain; object-position:left center; }
        .boton-menu { display:flex; flex-direction:column; justify-content:center; gap:4px; width:42px; height:38px; padding:8px; border:1px solid #d8dcd4; border-radius:9px; background:#fff; cursor:pointer; }
        .boton-menu:hover { background:#fff8c7; border-color:var(--banco-amarillo); }
        .boton-menu span { display:block; width:100%; height:2px; background:#222; border-radius:2px; }
        .capa-menu { position:fixed; inset:0; z-index:1000; background:rgba(16,19,14,.55); backdrop-filter:blur(2px); }
        .panel-menu { width:min(330px,88vw); height:100%; padding:22px 18px; background:#fff; box-shadow:8px 0 30px rgba(0,0,0,.16); display:flex; flex-direction:column; gap:8px; border-right:4px solid var(--banco-amarillo); }
        .panel-menu button { text-align:left; padding:13px 14px; border:1px solid transparent; border-radius:9px; background:#f6f7f5; color:#222; cursor:pointer; font-size:14px; font-weight:700; }
        .panel-menu button:hover { background:#fff5b8; border-color:#f0d500; }
        .cabecera-marca { display:flex; align-items:center; gap:22px; flex:1; }
        .nombre-proyecto-header { margin-left:auto; padding:0 12px; color:#111; font-family:Arial, Helvetica, sans-serif; font-weight:900; font-size:clamp(22px,2.3vw,30px); letter-spacing:.11em; }
        .nombre-proyecto-inicio { text-align:center; margin:0 auto 24px; color:#111; font-family:Arial, Helvetica, sans-serif; font-weight:900; font-size:clamp(30px,4vw,44px); letter-spacing:.16em; }
        .nombre-proyecto-inicio::after { content:""; display:block; width:76px; height:5px; border-radius:5px; background:var(--banco-amarillo); margin:12px auto 0; }
        .subtitulo { color:var(--banco-verde); font-size:10px; font-weight:900; letter-spacing:.14em; }
        .contenido { max-width:1600px; margin:0 auto; padding:30px clamp(16px,3vw,46px) 55px; }
        .contenido h1,.contenido h2,.contenido h3 { letter-spacing:-.025em; }
        .contenido p { line-height:1.55; }
        .tarjeta,.estadistica,.listado,.panel-tiempos-espera { background:#fff; border:1px solid var(--banco-borde); border-radius:14px; box-shadow:0 2px 8px rgba(0,0,0,.025); }
        .pantalla-inicio, .pantalla-consulta { max-width:1100px; margin:28px auto; padding:28px; background:#fff; border:1px solid var(--banco-borde); border-radius:16px; box-shadow:0 4px 18px rgba(0,0,0,.035); }
        .tarjetas-inicio { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:18px; margin-top:24px; }
        .accion-inicio { text-align:left; border:1px solid var(--banco-borde); border-top:4px solid var(--banco-amarillo); border-radius:14px; padding:22px; background:white; color:var(--banco-texto); cursor:pointer; transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease; }
        .accion-inicio:hover { border-color:var(--banco-amarillo); box-shadow:0 7px 20px rgba(0,0,0,.08); transform:translateY(-2px); }
        .accion-inicio strong { color:var(--banco-verde); }
        .form-consulta { display:grid; gap:14px; max-width:600px; }
        .form-consulta label { display:grid; gap:6px; font-weight:700; color:#454a43; }
        .form-consulta input, .form-consulta select { padding:11px 12px; border:1px solid #d8dcd4; border-radius:9px; font:inherit; background:#fff; color:#242721; }
        .form-consulta input:focus, .form-consulta select:focus { outline:2px solid #ffdf0088; border-color:#bda900; }
        .tabla-consulta { width:100%; border-collapse:collapse; margin-top:20px; background:#fff; }
        .tabla-consulta th { background:#f7f8f5; color:#62675f; font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
        .tabla-consulta th,.tabla-consulta td { padding:12px 10px; border-bottom:1px solid #e5e7e1; text-align:left; }
        .modal-salida { position:fixed; inset:0; background:rgba(16,19,14,.65); display:grid; place-items:center; z-index:1100; padding:18px; }
        .modal-salida-contenido { width:min(440px,100%); background:white; padding:26px; border-radius:16px; border-top:5px solid var(--banco-amarillo); box-shadow:0 24px 70px rgba(0,0,0,.22); }
        .modal-salida-contenido h2 { margin-top:0; }
        .modal-salida-contenido select { width:100%; background:#fff; border:1px solid #d8dcd4; border-radius:9px; padding:11px; margin-top:6px; }
        .acciones-modal { display:flex; gap:10px; justify-content:flex-end; margin-top:20px; flex-wrap:wrap; }
        .boton.principal { background:var(--banco-verde); color:#191919; border:1px solid var(--banco-verde); border-radius:9px; padding:11px 15px; font-weight:800; }
        .boton.principal:hover:not(:disabled) { background:var(--banco-verde-oscuro); border-color:var(--banco-verde-oscuro); color:#191919; }
        .boton.secundario { background:#fff; color:#292d27; border:1px solid #d8dcd4; border-radius:9px; padding:10px 14px; font-weight:750; }
        .boton.secundario:hover:not(:disabled) { background:#fff8c7; border-color:#e2cb00; }
        .aplicacion .indicador { background:#ffdf00 !important; }
        .aplicacion .subtitulo { color:#b39f00; }
        .aplicacion .accion-inicio strong { color:#191919; }
        @media(max-width:650px) { .encabezado { gap:12px; flex-wrap:wrap; padding:14px; } .cabecera-marca { gap:12px; flex-wrap:wrap; } .marca-banco-logo { width:145px; height:34px; } .pantalla-inicio,.pantalla-consulta { padding:18px; margin:12px; } .sucursal { font-size:12px; } .nombre-proyecto-header { font-size:22px; margin-left:0; } }
      `}</style>
      <header className="encabezado">
        <div className="cabecera-marca">
          <div className="marca-banco">
            <img className="marca-banco-logo" src="/bancolombia-logo.png" alt="Logo de Bancolombia" />
            <button className="boton-menu" type="button" aria-label="Abrir menú de navegación" aria-expanded={menuAbierto} onClick={() => setMenuAbierto(true)}>
              <span></span><span></span><span></span>
            </button>
          </div>
          <div>
            <p className="subtitulo">SISTEMA DE ATENCIÓN</p>
            <h1>{vista === "consola" ? "Consola de servicio" : vista === "consulta" ? "Consultar historial" : "Gestión de turnos"}</h1>
          </div>
        </div>

        {vista === "consola" && (
          <div className="nombre-proyecto-header" aria-label="Proyecto TURNINE">TURNINE</div>
        )}

        <div className="sucursal">
          <span className="indicador"></span>
          Sucursal Principal de Prueba
        </div>

        <button
          type="button"
          className="boton secundario"
          onClick={() => setMostrarMotivoSalida(true)}
        >
          Salir
        </button>
      </header>

      {menuAbierto && (
        <div className="capa-menu" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setMenuAbierto(false); }}>
          <nav className="panel-menu" aria-label="Menú principal">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <strong>Navegación</strong>
              <button type="button" aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)} style={{padding:"6px 10px"}}>✕</button>
            </div>
            <button type="button" onClick={() => { setVista("consola"); setMenuAbierto(false); cargarTurnos(); cargarTiemposEspera(); }}>▣　Consola de servicio</button>
            <button type="button" onClick={() => { setVista("consulta"); setMenuAbierto(false); setErrorConsulta(""); setResultadosConsulta([]); }}>⌕　Consultar</button>
            <button type="button" onClick={() => { setVista("inicio"); setMenuAbierto(false); }}>⌂　Volver a la página principal</button>
            <button type="button" onClick={() => { setMenuAbierto(false); setMostrarMotivoSalida(true); }}>↪　Salir</button>
          </nav>
        </div>
      )}

      {vista === "inicio" && (
        <main className="contenido pantalla-inicio">
          <div className="nombre-proyecto-inicio">TURNINE</div>
          <p className="subtitulo">SISTEMA DE ATENCIÓN · BANCOLOMBIA</p>
          <h2>¡Bienvenido a la consola de servicio!</h2>
          <p>Tu sesión está activa. Desde aquí puedes gestionar la atención de turnos o consultar el historial de un turno o cliente.</p>
          <div className="tarjetas-inicio">
            <button className="accion-inicio" type="button" onClick={() => { setVista("consola"); cargarTurnos(); cargarTiemposEspera(); }}>
              <h3>Consola de servicio</h3><p>Gestiona turnos, llama al siguiente cliente y administra la atención.</p><strong>Ir a la consola →</strong>
            </button>
            <button className="accion-inicio" type="button" onClick={() => { setVista("consulta"); setErrorConsulta(""); setResultadosConsulta([]); }}>
              <h3>Consultar</h3><p>Busca turnos por código o consulta por tipo y número de documento.</p><strong>Consultar historial →</strong>
            </button>
          </div>
        </main>
      )}

      {vista === "consulta" && (
        <main className="contenido pantalla-consulta">
          <p>Busca un turno por su código o un cliente por tipo y número de documento.</p>
          <div className="form-consulta">
            <label>Consultar por
              <select value={tipoBusqueda} onChange={(e) => { setTipoBusqueda(e.target.value); setResultadosConsulta([]); setErrorConsulta(""); }}>
                <option value="turno">Código de turno</option>
                <option value="documento">Documento del cliente</option>
              </select>
            </label>
            {tipoBusqueda === "turno" ? (
              <label>Código del turno<input value={codigoBusqueda} onChange={(e) => setCodigoBusqueda(e.target.value)} placeholder="Ej. A-025" /></label>
            ) : (
              <>
                <label>Tipo de documento
                  <select value={tipoDocumentoBusqueda} onChange={(e) => setTipoDocumentoBusqueda(e.target.value)}>
                    <option value="CC">Cédula de ciudadanía (CC)</option><option value="CE">Cédula de extranjería (CE)</option><option value="TI">Tarjeta de identidad (TI)</option><option value="PP">Pasaporte (PP)</option><option value="NIT">NIT</option>
                  </select>
                </label>
                <label>Número de documento<input value={numeroDocumentoBusqueda} onChange={(e) => setNumeroDocumentoBusqueda(e.target.value)} placeholder="Escribe el número de documento" /></label>
              </>
            )}
            <button className="boton principal" type="button" disabled={consultando || (tipoBusqueda === "turno" ? !codigoBusqueda.trim() : !numeroDocumentoBusqueda.trim())} onClick={async () => {
              setConsultando(true); setErrorConsulta(""); setResultadosConsulta([]);
              try {
                const datos = await consultarTurnos(SUCURSAL_ID);
                const normalizar = (v) => String(v ?? "").trim().toLowerCase();
                const encontrados = datos.filter((t) => tipoBusqueda === "turno"
                  ? normalizar(t.codigo).includes(normalizar(codigoBusqueda))
                  : normalizar(t.tipo_documento) === normalizar(tipoDocumentoBusqueda) && normalizar(t.numero_documento) === normalizar(numeroDocumentoBusqueda));
                setResultadosConsulta(encontrados);
                if (!encontrados.length) setErrorConsulta("No se encontraron turnos con esos datos en la información disponible.");
              } catch (err) { setErrorConsulta(obtenerMensajeError(err)); }
              finally { setConsultando(false); }
            }}>{consultando ? "Consultando…" : "Buscar"}</button>
          </div>
          {errorConsulta && <p role="status" style={{marginTop:16}}>{errorConsulta}</p>}
          {resultadosConsulta.length > 0 && <div style={{overflowX:"auto"}}><table className="tabla-consulta"><thead><tr><th>Turno</th><th>Servicio</th><th>Estado</th><th>Fecha operativa</th><th>Origen</th></tr></thead><tbody>{resultadosConsulta.map((t) => <tr key={t.id}><td>{t.codigo}</td><td>{nombreServicio(t.servicio_id)}</td><td>{estadoVisible(t.estado)}</td><td>{t.fecha_operativa || "—"}</td><td>{t.origen || "—"}</td></tr>)}</tbody></table><p style={{fontSize:13,color:"#666"}}>Esta vista muestra los datos que entrega actualmente el listado de turnos. Para un historial completo de cada cambio de estado y la búsqueda fiable por documento, se debe habilitar un endpoint de consulta de historial en el backend.</p></div>}
          <button className="boton secundario" type="button" style={{marginTop:20}} onClick={() => setVista("inicio")}>Volver a la página principal</button>
        </main>
      )}

      {vista === "consola" && <main className="contenido">
        {error && (
          <div className="tarjeta alerta" role="alert">
            <strong>No se pudo completar la operación</strong>
            <p>{error}</p>

            <button
              type="button"
              className="boton secundario"
              onClick={cargarTurnos}
              disabled={procesando}
            >
              Reintentar
            </button>
          </div>
        )}

        {mensaje && (
          <p className="mensaje-exito" role="status">
            {mensaje}
          </p>
        )}

        <style>{`
          .consola-con-lateral {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 320px;
            gap: 20px;
            align-items: start;
          }
          .consola-principal { min-width: 0; }
          .panel-tiempos-espera { position: sticky; top: 16px; padding: 18px; width: 100%; box-sizing: border-box; border-color: #d9dcd5; box-shadow: 0 4px 14px rgba(0,0,0,.055); }
          .lista-tiempos-espera { display: grid; gap: 12px; margin-top: 16px; }
          .item-tiempo-espera {
            border: 1px solid var(--borde, #e5e7eb);
            border-radius: 12px;
            padding: 14px;
            background: var(--fondo-tarjeta, #fff);
          }
          .item-tiempo-espera-cabecera { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
          .item-tiempo-espera h3 { margin: 0; font-size: 15px; }
          .tiempo-minutos { color:#191919; font-size: 24px; font-weight: 750; margin: 10px 0 2px; }
          .tiempo-detalle { font-size: 12px; color: #6b7280; margin: 0; }
          .tiempo-sin-turnos { font-size: 14px; margin: 10px 0 2px; }
          .boton-actualizar-tiempos { width: 100%; margin-top: 14px; }
          @media (max-width: 1050px) {
            .consola-con-lateral { grid-template-columns: minmax(0, 1fr); }
            .panel-tiempos-espera { position: static; }
            .lista-tiempos-espera { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
          }
        `}</style>

        <div className="consola-con-lateral">
          <div className="consola-principal">
        <section className="resumen">
          <article className="tarjeta estadistica">
            <span>Turnos en espera</span>
            <strong>{enEspera}</strong>
          </article>

          <article className="tarjeta estadistica">
            <span>En atención</span>
            <strong>{enAtencion}</strong>
          </article>

          <article className="tarjeta estadistica">
            <span>Retenidos</span>
            <strong>{retenidos}</strong>
          </article>
        </section>

        <section className="panel-actual tarjeta">
          <div>
            <p className="subtitulo">TURNO ACTUAL</p>

            {turnoActual ? (
              <>
                <h2>{turnoActual.codigo}</h2>

                <p>
                  {nombreServicio(turnoActual.servicio_id)} · Módulo{" "}
                  {turnoActual.modulo || MODULO}
                </p>

                <span className="estado estado-llamado">
                  Llamado
                </span>
              </>
            ) : (
              <>
                <h2>Sin turno asignado</h2>
                <p>
                  Selecciona el servicio y llama al siguiente cliente.
                </p>
              </>
            )}
          </div>

          <div className="acciones">
            <label>
              Servicio

              <select
                value={servicioId}
                onChange={(e) => setServicioId(e.target.value)}
                disabled={procesando}
              >
                <option value="1">Caja (ID 1)</option>
                <option value="2">Asesoría (ID 2)</option>
                <option value="3">Información (ID 3)</option>
              </select>
            </label>

            <button
              type="button"
              className="boton principal"
              onClick={manejarLlamado}
              disabled={
                procesando ||
                cargando ||
                tieneTurnoActivo
              }
              title={
                tieneTurnoActivo
                  ? `El módulo ya tiene el turno ${turnoActivoModulo.codigo} llamado`
                  : "Llamar al siguiente turno"
              }
            >
              {procesando
                ? "Procesando..."
                : tieneTurnoActivo
                  ? "Resuelve el turno actual"
                  : "Llamar siguiente"}
            </button>

            <button
              type="button"
              className="boton secundario"
              onClick={cargarTurnos}
              disabled={procesando}
            >
              Actualizar lista
            </button>
          </div>
        </section>

        <section className="tarjeta listado">
          <div className="titulo-seccion">
            <div>
              <p className="subtitulo">OPERACIÓN</p>
              <h2>Cola de turnos</h2>
            </div>

            <div className="acciones-tabla">
              <span className="contador">
                {turnos.length} turnos
              </span>
              <button
                type="button"
                className="boton secundario"
                onClick={manejarLimpiarTurnos}
                disabled={procesando || cargando || limpiandoTurnos}
                title="Solo disponible en el entorno de desarrollo"
              >
                {limpiandoTurnos ? "Limpiando..." : "Limpiar turnos de prueba"}
              </button>
            </div>
          </div>

          {cargando ? (
            <p>Cargando turnos desde el servidor...</p>
          ) : turnos.length === 0 ? (
            <p>No hay turnos registrados en esta sucursal.</p>
          ) : (
            <div className="tabla-contenedor">
              <table>
                <thead>
                  <tr>
                    <th>Turno</th>
                    <th>Servicio</th>
                    <th>Prioridad</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {turnos.map((turno) => {
                    const esTurnoActivoDelModulo =
                      turno.estado === "llamado" &&
                      String(turno.modulo ?? "") === MODULO;

                    const puedeReactivar =
                      (turno.estado === "retenido" ||
                        turno.estado === "ausente") &&
                      !tieneTurnoActivo;

                    return (
                      <tr key={turno.id}>
                        <td className="codigo">
                          {turno.codigo}
                        </td>

                        <td>
                          {nombreServicio(turno.servicio_id)}
                        </td>

                        <td>{turno.prioridad}</td>

                        <td>
                          <span
                            className={`estado estado-${estadoVisible(
                              turno.estado
                            )
                              .toLowerCase()
                              .replaceAll(" ", "-")}`}
                          >
                            {estadoVisible(turno.estado)}
                          </span>
                        </td>

                        <td>
                          {turno.estado === "llamado" && (
                            <div className="acciones-tabla">
                              <button
                                type="button"
                                className="boton secundario"
                                onClick={() =>
                                  manejarAccion("ausente", turno)
                                }
                                disabled={procesando}
                              >
                                Ausente
                              </button>

                              <button
                                type="button"
                                className="boton secundario"
                                onClick={() =>
                                  manejarAccion("retener", turno)
                                }
                                disabled={procesando}
                              >
                                Retener
                              </button>

                              <button
                                type="button"
                                className="boton secundario"
                                onClick={() => abrirFormularioTraslado(turno)}
                                disabled={procesando}
                              >
                                Trasladar
                              </button>

                              <button
                                type="button"
                                className="boton principal"
                                onClick={() =>
                                  abrirFormularioFinalizacion(turno)
                                }
                                disabled={procesando}
                              >
                                Finalizar
                              </button>
                            </div>
                          )}

                          {(turno.estado === "retenido" ||
                            turno.estado === "ausente") && (
                            <div className="acciones-tabla">
                              <button
                                type="button"
                                className="boton principal"
                                onClick={() =>
                                  manejarAccion("reactivar", turno)
                                }
                                disabled={
                                  procesando || !puedeReactivar
                                }
                                title={
                                  !puedeReactivar
                                    ? `Resuelve primero el turno ${turnoActivoModulo?.codigo || "activo"}`
                                    : "Reactivar turno"
                                }
                              >
                                Reactivar
                              </button>

                              {turno.estado === "retenido" && (
                                <>
                                  <button
                                    type="button"
                                    className="boton secundario"
                                    onClick={() => manejarAccion("ausente", turno)}
                                    disabled={procesando}
                                  >
                                    Ausente
                                  </button>

                                  <button
                                    type="button"
                                    className="boton secundario"
                                    onClick={() => abrirFormularioTraslado(turno)}
                                    disabled={procesando}
                                  >
                                    Trasladar
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          {turno.estado === "en_espera" && (
                            <div className="acciones-tabla">
                              <button
                                type="button"
                                className="boton secundario"
                                onClick={() => manejarAccion("ausente", turno)}
                                disabled={procesando}
                              >
                                Ausente
                              </button>

                              <button
                                type="button"
                                className="boton secundario"
                                onClick={() => abrirFormularioTraslado(turno)}
                                disabled={procesando}
                              >
                                Trasladar
                              </button>
                            </div>
                          )}

                          {turno.estado === "finalizado" && (
                            <span>Atención terminada</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="nota">
          Consola conectada con FastAPI · Sucursal ID {SUCURSAL_ID}
        </p>
          </div>

          <aside className="panel-tiempos-espera tarjeta" aria-labelledby="titulo-tiempos-espera">
            <div className="titulo-seccion">
              <div>
                <p className="subtitulo">SEGUIMIENTO</p>
                <h2 id="titulo-tiempos-espera">Tiempos de espera</h2>
              </div>
            </div>

            <p className="tiempo-detalle">
              Tiempo transcurrido desde la creación del turno más antiguo en espera de cada servicio.
            </p>

            {errorTiempos ? (
              <div className="alerta" role="alert">
                <p>{errorTiempos}</p>
              </div>
            ) : tiemposEspera.length === 0 ? (
              <p className="tiempo-sin-turnos">
                {cargandoTiempos ? "Consultando tiempos..." : "No hay servicios para mostrar."}
              </p>
            ) : (
              <div className="lista-tiempos-espera">
                {tiemposEspera.map((item) => (
                  <article className="item-tiempo-espera" key={item.servicio_id}>
                    <div className="item-tiempo-espera-cabecera">
                      <h3>{item.servicio || nombreServicio(item.servicio_id)}</h3>
                      <span className="indicador" aria-hidden="true"></span>
                    </div>

                    {item.turno_codigo ? (
                      <>
                        <p className="tiempo-minutos">
                          {item.minutos_espera ?? 0} min
                        </p>
                        <p className="tiempo-detalle">
                          Turno más antiguo: <strong>{item.turno_codigo}</strong>
                        </p>
                      </>
                    ) : (
                      <p className="tiempo-sin-turnos">Sin turnos en espera</p>
                    )}
                  </article>
                ))}
              </div>
            )}

            <button
              type="button"
              className="boton secundario boton-actualizar-tiempos"
              onClick={cargarTiemposEspera}
              disabled={cargandoTiempos}
            >
              {cargandoTiempos ? "Actualizando..." : "Actualizar tiempos"}
            </button>
            <p className="tiempo-detalle" style={{ marginTop: 8 }}>
              Actualización automática cada 30 segundos.
            </p>
          </aside>
        </div>
      </main>}

      {turnoPorFinalizar && !mostrarConfirmacion && (
        <div className="modal-fondo">
          <section
            className="modal tarjeta"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-documentacion"
          >
            <h2 id="titulo-documentacion">
              Documentar atención
            </h2>

            <p>
              Turno{" "}
              <strong>{turnoPorFinalizar.codigo}</strong>
            </p>

            <form onSubmit={continuarAConfirmacion}>
              <label className="campo-modal">
                Tipo de trámite

                <select
                  value={tipoTramite}
                  onChange={(e) => setTipoTramite(e.target.value)}
                  required
                  disabled={procesando}
                >
                  <option value="">Selecciona un trámite</option>
                  <option value="Retiro">Retiro</option>
                  <option value="Consignación">Consignación</option>
                  <option value="Pago">Pago</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Actualización de datos">
                    Actualización de datos
                  </option>
                  <option value="Asesoría">Asesoría</option>
                  <option value="Trámite digital">
                    Trámite digital
                  </option>
                  <option value="Otro">Otro</option>
                </select>
              </label>

              <label className="campo-modal">
                Observación de la atención

                <textarea
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  placeholder="Describe brevemente el trámite realizado..."
                  rows={4}
                  minLength={3}
                  maxLength={2000}
                  required
                  disabled={procesando}
                />
              </label>

              <p className="nota">
                La documentación se guardará antes de finalizar el turno.
              </p>

              <div className="acciones-modal">
                <button
                  type="button"
                  className="boton secundario"
                  onClick={cancelarFinalizacion}
                  disabled={procesando}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="boton principal"
                  disabled={procesando}
                >
                  Continuar
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {turnoPorFinalizar && mostrarConfirmacion && (
        <div className="modal-fondo">
          <section
            className="modal tarjeta"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-confirmacion"
          >
            <h2 id="titulo-confirmacion">
              Confirmar finalización
            </h2>

            <p>
              ¿Confirmas que deseas finalizar el turno{" "}
              <strong>{turnoPorFinalizar.codigo}</strong>?
            </p>

            <div className="resumen-documentacion">
              <p>
                <strong>Trámite:</strong> {tipoTramite}
              </p>

              <p>
                <strong>Observación:</strong>
              </p>

              <p>{observacion}</p>
            </div>

            <p className="nota">
              Al confirmar, se guardará la documentación y se finalizará
              la atención.
            </p>

            <div className="acciones-modal">
              <button
                type="button"
                className="boton secundario"
                onClick={() => setMostrarConfirmacion(false)}
                disabled={procesando}
              >
                Volver
              </button>

              <button
                type="button"
                className="boton principal"
                onClick={confirmarFinalizacion}
                disabled={procesando}
              >
                {procesando
                  ? "Finalizando..."
                  : "Confirmar y finalizar"}
              </button>
            </div>
          </section>
        </div>
      )}

      {turnoPorTrasladar && (
        <div className="modal-fondo">
          <section
            className="modal tarjeta"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-traslado"
          >
            <h2 id="titulo-traslado">Trasladar turno</h2>

            <p>
              Turno: <strong>{turnoPorTrasladar.codigo}</strong>
            </p>

            <p>
              Servicio actual:{" "}
              <strong>
                {nombreServicio(turnoPorTrasladar.servicio_id)}
              </strong>
            </p>

            <form onSubmit={confirmarTraslado}>
              <label className="campo-modal">
                Servicio de destino

                <select
                  value={nuevoServicioId}
                  onChange={(e) => setNuevoServicioId(e.target.value)}
                  required
                  disabled={procesando}
                >
                  <option value="">Selecciona un servicio</option>

                  {servicios
                    .filter(
                      (servicio) =>
                        Number(servicio.id) !==
                        Number(turnoPorTrasladar.servicio_id)
                    )
                    .map((servicio) => (
                      <option key={servicio.id} value={servicio.id}>
                        {servicio.nombre}
                      </option>
                    ))}
                </select>
              </label>

              <label className="campo-modal">
                Motivo del traslado (opcional)

                <textarea
                  value={motivoTraslado}
                  onChange={(e) => setMotivoTraslado(e.target.value)}
                  placeholder="Ej.: el cliente requiere atención de asesoría..."
                  rows={4}
                  maxLength={500}
                  disabled={procesando}
                />
              </label>

              <p className="nota">
                El código del turno se conservará y el cambio quedará
                registrado en el historial.
              </p>

              <div className="acciones-modal">
                <button
                  type="button"
                  className="boton secundario"
                  onClick={cancelarTraslado}
                  disabled={procesando}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="boton principal"
                  disabled={procesando || !nuevoServicioId}
                >
                  {procesando ? "Trasladando..." : "Confirmar traslado"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {mostrarMotivoSalida && (
        <div className="modal-salida" role="dialog" aria-modal="true" aria-labelledby="titulo-salida">
          <div className="modal-salida-contenido">
            <h2 id="titulo-salida">Salir de la consola</h2>
            <p>Selecciona el motivo para cerrar la sesión.</p>
            <label style={{display:"grid",gap:8}}>Motivo de salida
              <select value={motivoSalida} onChange={(e) => setMotivoSalida(e.target.value)} style={{padding:11,border:"1px solid #ccc",borderRadius:8}}>
                <option value="Almuerzo">Almuerzo</option><option value="Pausa activa">Pausa activa</option><option value="Fin de la jornada">Fin de la jornada</option>
              </select>
            </label>
            <div className="acciones-modal">
              <button className="boton secundario" type="button" onClick={() => setMostrarMotivoSalida(false)}>Cancelar</button>
              <button className="boton principal" type="button" onClick={() => { manejarCerrarSesion(); setMostrarMotivoSalida(false); setVista("inicio"); }}>Cerrar sesión</button>
            </div>
            <p style={{fontSize:12,color:"#666",marginTop:12}}>El motivo seleccionado es: {motivoSalida}. Por ahora se cierra la sesión local; registrar el motivo requiere una operación adicional en el backend.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

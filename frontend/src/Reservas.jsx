import { useEffect, useMemo, useState } from "react";
import "./Reservas.css";
import {
  consultarTurnoPorDocumento,
  activarTurnoVirtual,
  congelarTurnoVirtual,
  descongelarTurnoVirtual,
  cancelarReservaVirtual,
} from "./api";

const API = "http://127.0.0.1:8000/turnos";

const TIPOS_DOCUMENTO = [
  "Cédula de ciudadanía",
  "Cédula de extranjería",
  "Pasaporte",
  "Tarjeta de identidad",
  "Registro civil",
  "Documento venezolano",
];

const HORARIOS = (() => {
  const lista = [];
  for (let minutos = 8 * 60 + 30; minutos <= 16 * 60; minutos += 30) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    const hora12 = h % 12 || 12;
    lista.push(`${hora12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`);
  }
  return lista;
})();

const INICIAL = {
  tipoDocumento: "",
  numeroDocumento: "",
  celular: "",
  aceptaTerminos: false,
  servicioId: "",
  prioridad: "Normal",
  departamento: "",
  municipio: "",
  sucursalId: "",
  fecha: "",
  hora: "",
};

async function pedir(url, opciones = {}) {
  const respuesta = await fetch(url, opciones);
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new Error(
      typeof datos.detail === "string"
        ? datos.detail
        : "No fue posible completar la solicitud."
    );
  }
  return datos;
}

function fechaLocalMinima() {
  const ahora = new Date();
  const fecha = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000);
  return fecha.toISOString().slice(0, 10);
}

function avisoError(error) {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}

export default function Reservas() {
  const [paso, setPaso] = useState(0);
  const [datos, setDatos] = useState(INICIAL);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(true);
  const [cargandoServicios, setCargandoServicios] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

  // Gestión de una reserva existente desde la misma página.
  const [gestionAbierta, setGestionAbierta] = useState(false);
  const [tipoGestion, setTipoGestion] = useState(TIPOS_DOCUMENTO[0]);
  const [documentoGestion, setDocumentoGestion] = useState("");
  const [turnoGestion, setTurnoGestion] = useState(null);
  const [cargandoGestion, setCargandoGestion] = useState(false);
  const [errorGestion, setErrorGestion] = useState("");
  const [mensajeGestion, setMensajeGestion] = useState("");

  const actualizar = (campo, valor) => {
    setDatos((anterior) => ({ ...anterior, [campo]: valor }));
    setError("");
  };

  useEffect(() => {
    let activa = true;
    pedir(`${API}/catalogos/ubicaciones`)
      .then((lista) => {
        if (activa) setUbicaciones(Array.isArray(lista) ? lista : []);
      })
      .catch((e) => {
        if (activa) setError(avisoError(e));
      })
      .finally(() => {
        if (activa) setCargandoUbicaciones(false);
      });
    return () => {
      activa = false;
    };
  }, []);

  useEffect(() => {
    let activa = true;
    setCargandoServicios(true);

    pedir(`${API}/catalogos/servicios`)
      .then((lista) => {
        if (!activa) return;

        const catalogo = Array.isArray(lista) ? lista : [];
        // En la reserva virtual solo se ofrecen las categorías generales:
        // Caja y Asesoría. Las variantes prioritarias y específicas de turnos
        // permanecen en el catálogo para los demás flujos del sistema.
        const serviciosVirtuales = catalogo.filter((servicio) => {
          const nombre = String(servicio.nombre || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toLowerCase();

          return nombre === "caja" || nombre === "asesoria";
        });

        setServicios(serviciosVirtuales);
        // Si el servicio seleccionado ya no está disponible en este flujo,
        // limpiarlo para evitar enviar una selección que quedó oculta.
        setDatos((anterior) => ({
          ...anterior,
          servicioId: serviciosVirtuales.some(
            (servicio) => String(servicio.id) === String(anterior.servicioId)
          )
            ? anterior.servicioId
            : "",
        }));
      })
      .catch((e) => {
        if (activa) {
          setServicios([]);
          setError(avisoError(e));
        }
      })
      .finally(() => {
        if (activa) setCargandoServicios(false);
      });

    return () => {
      activa = false;
    };
  }, []);

  const departamentos = useMemo(
    () => [...new Set(ubicaciones.map((s) => s.departamento).filter(Boolean))].sort(),
    [ubicaciones]
  );

  const municipios = useMemo(
    () => [
      ...new Set(
        ubicaciones
          .filter((s) => s.departamento === datos.departamento)
          .map((s) => s.municipio)
          .filter(Boolean)
      ),
    ].sort(),
    [ubicaciones, datos.departamento]
  );

  const sucursales = useMemo(
    () => ubicaciones.filter(
      (s) => s.departamento === datos.departamento && s.municipio === datos.municipio
    ),
    [ubicaciones, datos.departamento, datos.municipio]
  );

  const sucursalSeleccionada = sucursales.find(
    (s) => String(s.id) === String(datos.sucursalId)
  );

  const servicioSeleccionado = servicios.find(
    (s) => String(s.id) === String(datos.servicioId)
  );

  const cambiarDepartamento = (valor) => {
    setDatos((d) => ({ ...d, departamento: valor, municipio: "", sucursalId: "" }));
    setError("");
  };

  const cambiarMunicipio = (valor) => {
    setDatos((d) => ({ ...d, municipio: valor, sucursalId: "" }));
    setError("");
  };

  const cambiarSucursal = (valor) => {
    setDatos((d) => ({ ...d, sucursalId: valor }));
    setError("");
  };

  function validarPaso() {
    if (paso === 1) {
      if (!datos.tipoDocumento || !datos.numeroDocumento.trim()) {
        return "Completa el tipo y número de documento.";
      }
      if (!/^\d{5,20}$/.test(datos.numeroDocumento.trim())) {
        return "El documento debe contener únicamente números.";
      }
      if (!/^3\d{9}$/.test(datos.celular)) {
        return "Ingresa un celular colombiano de 10 dígitos que comience por 3.";
      }
    }
    if (paso === 2 && !datos.aceptaTerminos) {
      return "Debes aceptar los términos y condiciones.";
    }
    if (paso === 3 && !datos.servicioId) {
      return "Selecciona el servicio que necesitas.";
    }
    if (paso === 4 && (!datos.departamento || !datos.municipio || !datos.sucursalId)) {
      return "Selecciona el departamento, municipio y sucursal.";
    }
    if (paso === 5) {
      if (!datos.fecha || !datos.hora) return "Selecciona una fecha y un horario.";
      if (datos.fecha < fechaLocalMinima()) return "La fecha no puede estar en el pasado.";
      const fechaHoraSeleccionada = new Date(`${datos.fecha}T${horaA24(datos.hora)}:00-05:00`);
      if (fechaHoraSeleccionada.getTime() < Date.now()) {
        return "La hora seleccionada ya pasó. Elige un horario futuro.";
      }
    }
    return "";
  }

  function avanzar() {
    const mensaje = validarPaso();
    if (mensaje) {
      setError(mensaje);
      return;
    }
    setError("");
    setPaso((p) => Math.min(p + 1, 6));
  }

  async function confirmarReserva() {
    const mensaje = validarPaso();
    if (mensaje) {
      setError(mensaje);
      return;
    }
    if (!datos.aceptaTerminos) {
      setError("Debes aceptar los términos y condiciones.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const hora24 = horaA24(datos.hora);
      const fechaHoraISO = `${datos.fecha}T${hora24}:00-05:00`;
      const respuesta = await pedir(`${API}/virtual/reservar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sucursal_id: Number(datos.sucursalId),
          servicio_id: Number(datos.servicioId),
          tipo_documento: datos.tipoDocumento,
          numero_documento: datos.numeroDocumento.trim(),
          celular: `+57${datos.celular}`,
          fecha_hora_programada: fechaHoraISO,
          acepta_terminos: datos.aceptaTerminos,
        }),
      });
      setResultado(respuesta);
      setPaso(7);
    } catch (e) {
      setError(avisoError(e));
    } finally {
      setEnviando(false);
    }
  }

  async function buscarTurnoGestion() {
    if (!tipoGestion || !/^\d{5,20}$/.test(documentoGestion.trim())) {
      setErrorGestion("Ingresa el tipo y un número de documento válido.");
      return;
    }
    try {
      setCargandoGestion(true);
      setErrorGestion("");
      setMensajeGestion("");
      setTurnoGestion(null);
      const respuesta = await consultarTurnoPorDocumento(tipoGestion, documentoGestion.trim());
      if (!respuesta?.tiene_turno_activo || !respuesta?.turno) {
        setErrorGestion(respuesta?.mensaje || "No encontramos un turno activo con esos datos.");
        return;
      }
      if (respuesta.turno.origen !== "virtual") {
        setErrorGestion("El turno encontrado no corresponde a una reserva virtual.");
        return;
      }
      setTurnoGestion(respuesta.turno);
    } catch (e) {
      setErrorGestion(avisoError(e));
    } finally {
      setCargandoGestion(false);
    }
  }

  async function ejecutarAccionGestion(accion) {
    if (!turnoGestion) return;
    if (accion === "cancelar" && !window.confirm("¿Seguro que deseas cancelar esta reserva? Esta acción no se puede deshacer.")) {
      return;
    }
    const funciones = {
      activar: activarTurnoVirtual,
      congelar: congelarTurnoVirtual,
      descongelar: descongelarTurnoVirtual,
      cancelar: cancelarReservaVirtual,
    };
    try {
      setCargandoGestion(true);
      setErrorGestion("");
      setMensajeGestion("");
      const respuesta = await funciones[accion](tipoGestion, documentoGestion.trim());
      setMensajeGestion(respuesta?.mensaje || "La acción se completó correctamente.");
      if (accion === "cancelar") {
        setTurnoGestion({ ...turnoGestion, estado: "cancelado" });
      } else if (respuesta?.turno) {
        setTurnoGestion((actual) => ({ ...actual, ...respuesta.turno }));
      } else {
        const estados = { activar: "en_espera", congelar: "congelado", descongelar: "en_espera" };
        setTurnoGestion((actual) => ({ ...actual, estado: estados[accion] || actual.estado }));
      }
    } catch (e) {
      setErrorGestion(avisoError(e));
    } finally {
      setCargandoGestion(false);
    }
  }

  const pasos = ["Bienvenida", "Tus datos", "Términos", "Servicio", "Sucursal", "Horario", "Confirmación"];

  return (
    <main className="reservas-page">
      <header className="reservas-header">
        <a href="/" className="reservas-brand" aria-label="Volver al inicio">
          <img src="/bancolombia-logo.png" alt="Bancolombia" />
        </a>
        <span className="reservas-header-label">Turnos virtuales</span>
      </header>

      <section className="reservas-container">
        <div className="reservas-hero">
          <div>
            <span className="reservas-eyebrow">SERVICIO A TU ALCANCE</span>
            <h1>Reserva tu turno virtual</h1>
            <p>Cuéntanos qué necesitas y elige la sucursal que más te convenga.</p>
          </div>
          <div className="reservas-hero-icon" aria-hidden="true">↗</div>
        </div>

        <div className="reservas-alerta">
          <span className="reservas-alerta-icon">!</span>
          <div>
            <strong>IMPORTANTE: ESTO NO ES UNA CITA</strong>
            <p>La hora seleccionada es una referencia para activar tu turno. Debes activarlo desde 10 minutos antes y hasta 30 minutos después de la hora reservada. Después de activarlo, espera el llamado.</p>
          </div>
        </div>

        {paso < 7 && paso > 0 && (
          <div className="reservas-progreso">
            <div className="reservas-progreso-texto"><span>Paso {paso} de 6</span><span>{pasos[paso]}</span></div>
            <div className="reservas-progreso-track"><div style={{ width: `${(paso / 6) * 100}%` }} /></div>
          </div>
        )}

        <section className="reservas-card">
          {paso === 0 && (
            <div className="reservas-paso reservas-bienvenida">
              <span className="reservas-icono-grande">⌁</span>
              <h2>¡Hola! Hagamos tu reserva</h2>
              <p>En pocos pasos podrás elegir el servicio, la sucursal y el horario en el que deseas activar tu turno.</p>
              <ul className="reservas-beneficios">
                <li>✓ Elige una sucursal en Colombia.</li>
                <li>✓ Consulta los servicios disponibles.</li>
                <li>✓ Revisa tus datos antes de confirmar.</li>
              </ul>
              <div className="reservas-botones-inicio">
                <button type="button" className="reservas-btn reservas-btn-primary" onClick={avanzar}>Nueva reserva <span>→</span></button>
                <button type="button" className="reservas-btn reservas-btn-secondary" onClick={() => { setGestionAbierta((v) => !v); setErrorGestion(""); setMensajeGestion(""); setTurnoGestion(null); }}>
                  {gestionAbierta ? "Cerrar gestión" : "Gestiona tu turno"}
                </button>
              </div>

              {gestionAbierta && (
                <section className="reservas-gestion">
                  <h2>Consulta y gestiona tu turno</h2>
                  <p>Ingresa tus datos para consultar una reserva virtual existente.</p>
                  <label htmlFor="tipoGestion">Tipo de documento</label>
                  <select id="tipoGestion" value={tipoGestion} onChange={(e) => setTipoGestion(e.target.value)}>
                    <option value="">Selecciona tu documento</option>
                    {TIPOS_DOCUMENTO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                  </select>
                  <label htmlFor="documentoGestion">Número de documento</label>
                  <input id="documentoGestion" inputMode="numeric" maxLength={20} value={documentoGestion} placeholder="Escribe solo números" onChange={(e) => setDocumentoGestion(e.target.value.replace(/\D/g, ""))} />
                  <button type="button" className="reservas-btn reservas-btn-primary" onClick={buscarTurnoGestion} disabled={cargandoGestion}>
                    {cargandoGestion ? "Consultando..." : "Consultar turno"}
                  </button>
                  {errorGestion && <div className="reservas-error" role="alert"><span>{errorGestion}</span></div>}
                  {mensajeGestion && <div className="reservas-gestion-mensaje" role="status">{mensajeGestion}</div>}
                  {turnoGestion && (
                    <div className="reservas-gestion-turno">
                      <h3>Turno {turnoGestion.codigo || "virtual"}</h3>
                      <p>Estado: <strong>{turnoGestion.estado}</strong></p>
                      {turnoGestion.fecha_hora_programada && <p>Horario de referencia: <strong>{new Date(turnoGestion.fecha_hora_programada).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</strong></p>}
                      {turnoGestion.estado === "reservado" && <button type="button" className="reservas-btn reservas-btn-primary" onClick={() => ejecutarAccionGestion("activar")} disabled={cargandoGestion}>Activar turno</button>}
                      {turnoGestion.estado === "en_espera" && <button type="button" className="reservas-btn reservas-btn-secondary" onClick={() => ejecutarAccionGestion("congelar")} disabled={cargandoGestion}>Congelar turno</button>}
                      {turnoGestion.estado === "congelado" && <button type="button" className="reservas-btn reservas-btn-primary" onClick={() => ejecutarAccionGestion("descongelar")} disabled={cargandoGestion}>Reanudar turno</button>}
                      {["reservado", "en_espera", "congelado"].includes(turnoGestion.estado) && <button type="button" className="reservas-btn reservas-btn-secondary" onClick={() => ejecutarAccionGestion("cancelar")} disabled={cargandoGestion}>Cancelar reserva</button>}
                      {turnoGestion.estado === "reservado" && <p className="reservas-nota">Recuerda: esto no es una cita. La activación está permitida desde 10 minutos antes hasta 30 minutos después del horario reservado. El servidor validará la ventana de activación.</p>}
                      {turnoGestion.estado === "en_espera" && <p className="reservas-nota">Tu turno está activo. Espera a que te llamen.</p>}
                      {turnoGestion.estado === "congelado" && <p className="reservas-nota">Tu turno está congelado temporalmente. Reanúdalo según las reglas del sistema.</p>}
                      {turnoGestion.estado === "cancelado" && <p className="reservas-nota">Esta reserva fue cancelada.</p>}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {paso === 1 && (
            <div className="reservas-paso">
              <h2>Identifiquemos tus datos</h2>
              <p className="reservas-subtitulo">Utilizaremos esta información para identificar tu reserva.</p>
              <label>Tipo de documento</label>
              <select value={datos.tipoDocumento} onChange={(e) => actualizar("tipoDocumento", e.target.value)}>
                <option value="">Selecciona tu documento</option>
                {TIPOS_DOCUMENTO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
              </select>
              <label>Número de documento</label>
              <input inputMode="numeric" value={datos.numeroDocumento} maxLength={20} placeholder="Escribe solo números" onChange={(e) => actualizar("numeroDocumento", e.target.value.replace(/\D/g, ""))} />
              <label>Celular colombiano</label>
              <div className="reservas-celular"><span>🇨🇴 +57</span><input type="tel" inputMode="numeric" value={datos.celular} maxLength={10} placeholder="3001234567" onChange={(e) => actualizar("celular", e.target.value.replace(/\D/g, "").slice(0, 10))} /></div>
              <small>Ingresa un número móvil colombiano de 10 dígitos.</small>
            </div>
          )}

          {paso === 2 && (
            <div className="reservas-paso">
              <h2>Términos y condiciones</h2>
              <p className="reservas-subtitulo">Lee esta información antes de continuar.</p>
              <div className="reservas-terminos">
                <h3>Uso del turno virtual</h3>
                <p>La reserva virtual no constituye una cita ni garantiza que serás atendido exactamente a la hora seleccionada.</p>
                <p>Debes activar el turno dentro de la ventana habilitada: desde 10 minutos antes hasta 30 minutos después del horario seleccionado. Si no lo activas dentro de ese periodo, la reserva podrá marcarse como ausente.</p>
                <p>Una vez activado, deberás esperar el llamado de acuerdo con el orden de atención y las reglas de prioridad aplicables.</p>
                <p>Tus datos se utilizarán para gestionar la reserva. Consulta las políticas oficiales de tratamiento de datos de la entidad antes de habilitar el servicio en producción.</p>
              </div>
              <label className="reservas-checkbox"><input type="checkbox" checked={datos.aceptaTerminos} onChange={(e) => actualizar("aceptaTerminos", e.target.checked)} /><span>He leído y acepto los términos y condiciones.</span></label>
            </div>
          )}

          {paso === 3 && (
            <div className="reservas-paso">
              <h2>¿Qué servicio necesitas?</h2>
              <p className="reservas-subtitulo">Selecciona el servicio que deseas realizar en la sucursal.</p>
              {cargandoServicios ? <p>Cargando servicios disponibles...</p> : servicios.length === 0 ? <div className="reservas-vacio">No hay servicios disponibles. Verifica que el catálogo de servicios esté configurado en el sistema.</div> : (
                <div className="reservas-servicios">
                  {servicios.map((servicio) => (
                    <button type="button" key={servicio.id} className={`reservas-servicio ${String(datos.servicioId) === String(servicio.id) ? "seleccionado" : ""}`} onClick={() => actualizar("servicioId", String(servicio.id))}>
                      <span className="reservas-servicio-icono">↗</span><span><strong>{servicio.nombre}</strong><small>{servicio.descripcion || servicio.categoria}</small></span><span className="reservas-radio">{String(datos.servicioId) === String(servicio.id) ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
              <h3 className="reservas-mini-titulo">¿Necesitas atención prioritaria?</h3>
              <div className="reservas-prioridad">
                <label className={datos.prioridad === "Normal" ? "activa" : ""}><input type="radio" name="prioridad" checked={datos.prioridad === "Normal"} onChange={() => actualizar("prioridad", "Normal")} />Atención general</label>
                <label className={datos.prioridad === "Preferencial" ? "activa" : ""}><input type="radio" name="prioridad" checked={datos.prioridad === "Preferencial"} onChange={() => actualizar("prioridad", "Preferencial")} />Atención prioritaria</label>
              </div>
              <p className="reservas-nota">La atención prioritaria está sujeta a los criterios y requisitos aplicables de la entidad.</p>
            </div>
          )}

          {paso === 4 && (
            <div className="reservas-paso">
              <h2>¿Dónde deseas ser atendido?</h2>
              <p className="reservas-subtitulo">Selecciona la ubicación y luego la sucursal por su nombre.</p>
              <label>Departamento</label>
              <select value={datos.departamento} disabled={cargandoUbicaciones} onChange={(e) => cambiarDepartamento(e.target.value)}><option value="">{cargandoUbicaciones ? "Cargando..." : "Selecciona un departamento"}</option>{departamentos.map((d) => <option key={d} value={d}>{d}</option>)}</select>
              <label>Municipio</label>
              <select value={datos.municipio} disabled={!datos.departamento} onChange={(e) => cambiarMunicipio(e.target.value)}><option value="">Selecciona un municipio</option>{municipios.map((m) => <option key={m} value={m}>{m}</option>)}</select>
              <label>Sucursal</label>
              <select value={datos.sucursalId} disabled={!datos.municipio} onChange={(e) => cambiarSucursal(e.target.value)}><option value="">Selecciona la sucursal</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
              {sucursalSeleccionada && <div className="reservas-direccion"><strong>{sucursalSeleccionada.nombre}</strong><span>{sucursalSeleccionada.direccion || "Dirección no registrada"}</span><span>{sucursalSeleccionada.municipio}, {sucursalSeleccionada.departamento}</span></div>}
            </div>
          )}

          {paso === 5 && (
            <div className="reservas-paso">
              <h2>Elige el horario de referencia</h2>
              <p className="reservas-subtitulo">Horarios disponibles de 8:30 a. m. a 4:00 p. m.</p>
              <label>Fecha</label>
              <input type="date" min={fechaLocalMinima()} value={datos.fecha} onChange={(e) => actualizar("fecha", e.target.value)} />
              <label>Hora</label>
              <div className="reservas-horarios">{HORARIOS.map((hora) => <button key={hora} type="button" className={datos.hora === hora ? "seleccionado" : ""} onClick={() => actualizar("hora", hora)}>{hora}</button>)}</div>
              <div className="reservas-alerta reservas-alerta-pequena"><span className="reservas-alerta-icon">!</span><p>Este horario no es una cita. Debes activar tu turno dentro de la ventana permitida.</p></div>
            </div>
          )}

          {paso === 6 && (
            <div className="reservas-paso">
              <h2>Confirma tu información</h2>
              <p className="reservas-subtitulo">Revisa todos los datos antes de crear tu reserva.</p>
              <div className="reservas-resumen">
                <Resumen etiqueta="Documento" valor={`${datos.tipoDocumento} · ${datos.numeroDocumento}`} />
                <Resumen etiqueta="Celular" valor={`+57 ${datos.celular}`} />
                <Resumen etiqueta="Servicio" valor={servicioSeleccionado?.nombre || "No seleccionado"} />
                <Resumen etiqueta="Atención" valor={datos.prioridad === "Preferencial" ? "Prioritaria solicitada" : "General"} />
                <Resumen etiqueta="Departamento" valor={datos.departamento} />
                <Resumen etiqueta="Municipio" valor={datos.municipio} />
                <Resumen etiqueta="Sucursal" valor={sucursalSeleccionada?.nombre || "No seleccionada"} />
                <Resumen etiqueta="Dirección" valor={sucursalSeleccionada?.direccion || "No registrada"} />
                <Resumen etiqueta="Fecha" valor={datos.fecha} />
                <Resumen etiqueta="Hora de referencia" valor={datos.hora} />
              </div>
              <div className="reservas-alerta"><span className="reservas-alerta-icon">!</span><p><strong>Recuerda:</strong> esto no es una cita. La reserva debe activarse dentro de la ventana indicada.</p></div>
            </div>
          )}

          {paso === 7 && (
            <div className="reservas-paso reservas-exito">
              <span className="reservas-exito-icono">✓</span>
              <h2>¡Tu reserva está lista!</h2>
              <p>Tu reserva se registró correctamente. Guarda esta información para consultar y activar tu turno.</p>
              <div className="reservas-codigo"><span>Código de tu turno</span><strong>{resultado?.turno?.codigo || "Reserva registrada"}</strong></div>
              <div className="reservas-alerta"><span className="reservas-alerta-icon">!</span><p><strong>Esto no es una cita.</strong> Activa tu turno desde 10 minutos antes hasta 30 minutos después de la hora seleccionada. Luego debes esperar el llamado.</p></div>
              <button className="reservas-btn reservas-btn-primary" onClick={() => { setDatos(INICIAL); setResultado(null); setPaso(0); setError(""); }}>Volver al inicio</button>
            </div>
          )}

          {error && <div className="reservas-error" role="alert"><strong>No pudimos continuar</strong><span>{error}</span></div>}

          {paso > 0 && paso < 7 && (
            <div className="reservas-acciones">
              <button type="button" className="reservas-btn reservas-btn-secondary" onClick={() => { setError(""); setPaso((p) => Math.max(p - 1, 0)); }} disabled={enviando}>← Atrás</button>
              {paso < 6 ? <button type="button" className="reservas-btn reservas-btn-primary" onClick={avanzar}>Continuar <span>→</span></button> : <button type="button" className="reservas-btn reservas-btn-primary" onClick={confirmarReserva} disabled={enviando}>{enviando ? "Creando reserva..." : "Confirmar reserva"}</button>}
            </div>
          )}
        </section>

        <footer className="reservas-footer"><span>Atención cercana, fácil y segura.</span><span>Prototipo académico · Sistema de turnos</span></footer>
      </section>
    </main>
  );
}

function Resumen({ etiqueta, valor }) {
  return <div className="reservas-resumen-fila"><span>{etiqueta}</span><strong>{valor || "—"}</strong></div>;
}

function horaA24(hora) {
  const coincidencia = hora.match(/^(\d{1,2}):(\d{2}) (a\. m\.|p\. m\.)$/);
  if (!coincidencia) return "08:30";
  let horas = Number(coincidencia[1]);
  const minutos = coincidencia[2];
  const periodo = coincidencia[3];
  if (periodo === "p. m." && horas !== 12) horas += 12;
  if (periodo === "a. m." && horas === 12) horas = 0;
  return `${String(horas).padStart(2, "0")}:${minutos}`;
}

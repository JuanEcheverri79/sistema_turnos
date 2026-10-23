
import { useState } from "react";
import "./MPC.css";

import {
  consultarTurnoPorDocumento,
  crearTurnoMPC,
  cancelarTurnoMPC,
  activarTurnoVirtual,
} from "./api";

const SUCURSAL_ID = 1;

const TIPOS_DOCUMENTO = [
  "Cédula de ciudadanía",
  "Cédula de extranjería",
  "Pasaporte",
  "Tarjeta de identidad",
  "Registro civil",
  "Documento venezolano",
];

const CONDICIONES = [
  {
    id: "discapacidad",
    texto: "Estado de discapacidad",
    icono: "♿",
    color: "azul",
  },
  {
    id: "policia",
    texto: "Policía o militar\n(Uniforme obligatorio)",
    icono: "🛡",
    color: "verde",
  },
  {
    id: "embarazo",
    texto: "Estado de embarazo",
    icono: "♙",
    color: "rosa",
  },
  {
    id: "veterano",
    texto: "Veterano de guerra\n(Carnet o certificado)",
    icono: "♜",
    color: "morado",
  },
  {
    id: "adultoMayor",
    texto: "Mayor de 60 años",
    icono: "♟",
    color: "naranja",
  },
  {
    id: "compensacion",
    texto: "Compensación",
    icono: "✥",
    color: "coral",
  },
];

const SERVICIOS = [
  {
    id: 2,
    nombre: "Asesoría",
    icono: "👥",
    descripcion:
      "Reciba orientación sobre nuestros productos y servicios.",
  },
  {
    id: 1,
    nombre: "Caja",
    icono: "▤",
    descripcion:
      "Realice transacciones, consignaciones, retiros y otros servicios de caja.",
  },
  {
    id: 3,
    nombre: "Información",
    icono: "●",
    descripcion:
      "Solicita información o registro de visita.",
  },
];

function nombreServicio(id) {
  return (
    SERVICIOS.find(
      (servicio) => Number(servicio.id) === Number(id)
    )?.nombre ?? `Servicio ${id ?? ""}`
  );
}

function nombreEstado(estado) {
  const estados = {
    reservado: "Reservado",
    en_espera: "En espera",
    llamado: "Llamado",
    retenido: "Retenido",
    congelado: "Congelado",
    ausente: "Ausente",
    finalizado: "Finalizado",
  };

  return estados[estado] ?? estado ?? "Desconocido";
}

function fechaHoraColombia(fecha) {
  if (!fecha) return null;

  const fechaConvertida = new Date(fecha);

  if (Number.isNaN(fechaConvertida.getTime())) {
    return null;
  }

  return fechaConvertida.toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  });
}

function MPC() {
  const [tipoDocumento, setTipoDocumento] = useState(
    TIPOS_DOCUMENTO[0]
  );
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [condiciones, setCondiciones] = useState([]);
  const [servicioSeleccionado, setServicioSeleccionado] =
    useState(2);
  const [asignarModulo, setAsignarModulo] = useState(false);
  const [moduloSeleccionado, setModuloSeleccionado] =
    useState("");
  const [pantalla, setPantalla] = useState("documento");
  const [turno, setTurno] = useState(null);
  const [turnoExistente, setTurnoExistente] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  function agregarDigito(digito) {
    setNumeroDocumento((actual) =>
      actual.length < 30 ? actual + digito : actual
    );
    setError("");
    setMensaje("");
  }

  function reiniciar() {
    setTipoDocumento(TIPOS_DOCUMENTO[0]);
    setNumeroDocumento("");
    setCondiciones([]);
    setServicioSeleccionado(2);
    setAsignarModulo(false);
    setModuloSeleccionado("");
    setTurno(null);
    setTurnoExistente(null);
    setPantalla("documento");
    setError("");
    setMensaje("");
  }

  function alternarCondicion(id) {
    setCondiciones((actuales) =>
      actuales.includes(id)
        ? actuales.filter((item) => item !== id)
        : [...actuales, id]
    );
  }

  function continuarPolitica() {
    if (!numeroDocumento.trim()) {
      setError(
        "Ingresa tu número de documento antes de continuar."
      );
      return;
    }

    setError("");
    setMensaje("");
    setPantalla("politica");
  }

  async function aceptarPolitica() {
    try {
      setProcesando(true);
      setError("");
      setMensaje("");

      const resultado = await consultarTurnoPorDocumento(
        tipoDocumento,
        numeroDocumento
      );

      if (resultado.tiene_turno_activo && resultado.turno) {
        setTurnoExistente(resultado.turno);
        setPantalla("turno-existente");
      } else {
        setTurnoExistente(null);
        setPantalla("servicio");
      }
    } catch (err) {
      setError(
        err.message || "No fue posible consultar tu turno."
      );
    } finally {
      setProcesando(false);
    }
  }

  async function generarTurno() {
    if (!servicioSeleccionado) {
      setError("Selecciona el servicio que necesitas.");
      return;
    }

    try {
      setProcesando(true);
      setError("");
      setMensaje("");

      const nuevoTurno = await crearTurnoMPC({
        sucursalId: SUCURSAL_ID,
        servicioId: servicioSeleccionado,
        prioridad:
          condiciones.length > 0 ? "Preferencial" : "Normal",
        tipoDocumento,
        numeroDocumento,
      });

      setTurno({
        ...nuevoTurno,
        servicio_id:
          nuevoTurno.servicio_id ?? servicioSeleccionado,
        prioridad:
          nuevoTurno.prioridad ??
          (condiciones.length > 0 ? "Preferencial" : "Normal"),
        modulo: nuevoTurno.modulo ?? null,
      });

      setPantalla("resultado");
    } catch (err) {
      setError(
        err.message || "No fue posible generar tu turno."
      );
    } finally {
      setProcesando(false);
    }
  }

  async function activarReservaExistente() {
    if (!turnoExistente) {
      setError(
        "No se encontró la reserva que deseas activar."
      );
      return;
    }

    if (turnoExistente.estado !== "reservado") {
      setError(
        "Esta reserva ya no está pendiente de activación."
      );
      return;
    }

    try {
      setProcesando(true);
      setError("");
      setMensaje("");

      const resultado = await activarTurnoVirtual(
        tipoDocumento,
        numeroDocumento
      );

      if (!resultado?.turno) {
        throw new Error(
          "El servidor no devolvió la información del turno activado."
        );
      }

      setTurnoExistente((anterior) => ({
        ...anterior,
        ...resultado.turno,
      }));

      setMensaje(
        resultado.mensaje ||
          "Tu turno fue activado correctamente."
      );
    } catch (err) {
      setError(
        err.message || "No fue posible activar la reserva."
      );
    } finally {
      setProcesando(false);
    }
  }

  async function cancelarTurno() {
    if (!turno?.id) {
      setError("No se encontró el identificador del turno.");
      return;
    }

    try {
      setProcesando(true);
      setError("");
      setMensaje("");

      await cancelarTurnoMPC(turno.id);
      reiniciar();
    } catch (err) {
      setError(
        err.message || "No fue posible cancelar el turno."
      );
    } finally {
      setProcesando(false);
    }
  }

  const servicioActual = SERVICIOS.find(
    (servicio) =>
      Number(servicio.id) ===
      Number(turno?.servicio_id ?? turnoExistente?.servicio_id)
  );

  return (
    <div className="mpc">
      <header className="mpc-header">
        <img
          className="mpc-logo"
          src="/bancolombia-logo.png"
          alt="Logo de Bancolombia"
        />

        <div className="mpc-header-info">
          <span>Módulo de Primer de Contacto</span>
          <span>Gestión de Turnos</span>
          <span className="mpc-header-icon" aria-hidden="true">
            👥
          </span>
        </div>
      </header>

      {error && (
        <div className="mpc-error" role="alert">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="mpc-success-message" role="status">
          {mensaje}
        </div>
      )}

      {pantalla === "documento" && (
        <main className="mpc-document-layout">
          <section className="mpc-form-panel">
            <h2>1. Ingrese su número de documento</h2>
            <p className="mpc-subtitle">
              Seleccione el tipo de documento y digite su número.
            </p>

            <div className="mpc-document-content">
              <div className="mpc-document-fields">
                <label className="mpc-field">
                  <span>Tipo de documento</span>
                  <select
                    value={tipoDocumento}
                    onChange={(e) =>
                      setTipoDocumento(e.target.value)
                    }
                  >
                    {TIPOS_DOCUMENTO.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mpc-field">
                  <span>Número de documento</span>
                  <input
                    value={numeroDocumento}
                    readOnly
                    placeholder="Digite su número de documento"
                    aria-label="Número de documento"
                  />
                </label>
              </div>

              <div
                className="mpc-keypad"
                aria-label="Teclado numérico"
              >
                {[
                  "1", "2", "3",
                  "4", "5", "6",
                  "7", "8", "9",
                ].map((digito) => (
                  <button
                    type="button"
                    key={digito}
                    onClick={() => agregarDigito(digito)}
                  >
                    {digito}
                  </button>
                ))}

                <button
                  type="button"
                  className="mpc-key-secondary"
                  onClick={() => {
                    setNumeroDocumento((actual) =>
                      actual.slice(0, -1)
                    );
                    setError("");
                  }}
                  aria-label="Borrar último dígito"
                >
                  ⌫
                </button>

                <button
                  type="button"
                  onClick={() => agregarDigito("0")}
                >
                  0
                </button>

                <button
                  type="button"
                  className="mpc-key-secondary mpc-clear"
                  onClick={() => {
                    setNumeroDocumento("");
                    setError("");
                  }}
                >
                  Limpiar
                </button>
              </div>
            </div>

            <div className="mpc-priorities">
              <h3>
                ¿Tiene alguna de las siguientes condiciones?
              </h3>
              <p>Seleccione las opciones que apliquen.</p>

              <div className="mpc-checklist">
                {CONDICIONES.map((condicion) => (
                  <label
                    className="mpc-check-item"
                    key={condicion.id}
                  >
                    <input
                      type="checkbox"
                      checked={condiciones.includes(condicion.id)}
                      onChange={() =>
                        alternarCondicion(condicion.id)
                      }
                    />

                    <span
                      className={`mpc-condition-icon ${condicion.color}`}
                    >
                      {condicion.icono}
                    </span>

                    <span className="mpc-condition-text">
                      {condicion.texto
                        .split("\n")
                        .map((linea, i) => (
                          <span key={i}>{linea}</span>
                        ))}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mpc-document-actions">
              <button
                type="button"
                className="mpc-reset-button"
                onClick={reiniciar}
              >
                <span aria-hidden="true">↻</span>
                Reiniciar
              </button>

              <button
                type="button"
                className="mpc-continue-button"
                onClick={continuarPolitica}
              >
                Continuar <span aria-hidden="true">❯</span>
              </button>
            </div>
          </section>

          <aside className="mpc-policy-sidebar">
            <div
              className="mpc-document-icon"
              aria-hidden="true"
            >
              ▤
            </div>
            <h2>Información sobre política de datos</h2>
            <p>
              En Bancolombia protegemos sus datos personales.
              La información suministrada será utilizada para
              la gestión de turnos y la atención en nuestros
              servicios, conforme a la política de tratamiento
              de datos personales aplicable.
            </p>
            <button
              type="button"
              className="mpc-policy-detail"
              onClick={() => setPantalla("politica")}
            >
              Ver detalle de la política de datos
            </button>
          </aside>
        </main>
      )}

      {pantalla === "politica" && (
        <main className="mpc-policy-screen">
          <section className="mpc-policy-card">
            <div
              className="mpc-document-icon mpc-document-icon-large"
              aria-hidden="true"
            >
              ▤
            </div>

            <h1>Información sobre política de datos</h1>

            <p>
              En Bancolombia tratamos sus datos personales de
              manera segura y confidencial, de acuerdo con la
              Ley 1581 de 2012 y demás normas aplicables.
            </p>

            <p>
              La información suministrada será utilizada para
              la gestión de turnos, la atención en nuestros
              servicios y la mejora de la experiencia de los
              clientes.
            </p>

            <div className="mpc-policy-notice">
              <span className="mpc-shield" aria-hidden="true">
                ✓
              </span>
              <span>
                Si desea conocer más, puede consultar la
                política de tratamiento de datos personales en{" "}
                <strong>www.bancolombia.com</strong>.
              </span>
            </div>

            <div className="mpc-policy-actions">
              <button
                type="button"
                className="mpc-reject-button"
                onClick={reiniciar}
              >
                Rechazar
              </button>

              <button
                type="button"
                className="mpc-continue-button"
                onClick={aceptarPolitica}
                disabled={procesando}
              >
                {procesando ? "Consultando..." : "Continuar"}
              </button>
            </div>
          </section>
        </main>
      )}

      {pantalla === "servicio" && (
        <main className="mpc-service-screen">
          <div className="mpc-service-heading">
            <div>
              <h2>2. Seleccionar servicio</h2>
              <p>
                Elija el servicio que mejor se ajuste a su
                necesidad.
              </p>
            </div>

            <button
              type="button"
              className="mpc-back-button"
              onClick={() => {
                setError("");
                setMensaje("");
                setPantalla("documento");
              }}
            >
              ‹ &nbsp; Volver
            </button>
          </div>

          <div className="mpc-service-cards">
            {SERVICIOS.map((servicio) => (
              <button
                type="button"
                key={servicio.id}
                className={`mpc-service-card ${
                  servicioSeleccionado === servicio.id
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setServicioSeleccionado(servicio.id)
                }
              >
                <span
                  className={`mpc-service-icon service-${servicio.id}`}
                >
                  {servicio.icono}
                </span>
                <strong>{servicio.nombre}</strong>
                <span>{servicio.descripcion}</span>
              </button>
            ))}
          </div>

          <section className="mpc-module-panel">
            <div className="mpc-module-heading">
              <strong>
                ¿Desea asignar un módulo en específico?
              </strong>

              <div className="mpc-toggle">
                <button
                  type="button"
                  className={asignarModulo ? "active" : ""}
                  onClick={() => setAsignarModulo(true)}
                >
                  Sí
                </button>

                <button
                  type="button"
                  className={!asignarModulo ? "active" : ""}
                  onClick={() => {
                    setAsignarModulo(false);
                    setModuloSeleccionado("");
                  }}
                >
                  No
                </button>
              </div>
            </div>

            <p>
              Si selecciona Sí, podrá elegir un módulo. Si
              selecciona No, el sistema lo asignará
              automáticamente.
            </p>

            <label className="mpc-module-select">
              <span>Seleccione el módulo</span>
              <select
                value={moduloSeleccionado}
                onChange={(e) =>
                  setModuloSeleccionado(e.target.value)
                }
                disabled={!asignarModulo}
              >
                <option value="">
                  Seleccione un módulo
                </option>
                <option value="1">Módulo 1</option>
                <option value="2">Módulo 2</option>
                <option value="3">Módulo 3</option>
              </select>
            </label>

            {asignarModulo && (
              <p className="mpc-module-warning">
                La selección de módulo es visual. La asignación
                específica requiere soporte en el backend.
              </p>
            )}
          </section>

          <div className="mpc-service-actions">
            <button
              type="button"
              className="mpc-continue-button"
              onClick={generarTurno}
              disabled={
                procesando ||
                (asignarModulo && !moduloSeleccionado)
              }
            >
              {procesando
                ? "Generando turno..."
                : "Continuar　❯"}
            </button>
          </div>
        </main>
      )}

      {pantalla === "resultado" && turno && (
        <main className="mpc-result-screen">
          <div className="mpc-success-icon" aria-hidden="true">
            ✓
          </div>

          <h1>¡Bienvenido a Bancolombia!</h1>
          <p className="mpc-result-subtitle">
            Su turno ha sido generado correctamente.
          </p>

          <div className="mpc-result-layout">
            <section className="mpc-result-ticket">
              <p>Turno generado</p>
              <div className="mpc-result-code">
                {turno.codigo}
              </div>
              <div className="mpc-ticket-divider" />

              <p className="mpc-ticket-detail">
                <span aria-hidden="true">👥</span>
                Servicio: {nombreServicio(turno.servicio_id)}
              </p>

              <p className="mpc-ticket-detail">
                <span aria-hidden="true">▣</span>
                Estado: {nombreEstado(turno.estado)}
              </p>

              {turno.prioridad === "Preferencial" && (
                <p className="mpc-priority-result">
                  Atención preferencial
                </p>
              )}
            </section>

            <aside className="mpc-virtual-panel">
              <div className="mpc-phone-icon" aria-hidden="true">
                ▯
              </div>
              <strong>Tu turno está listo</strong>
              <p>
                Espera a que tu turno sea llamado en la pantalla
                pública de la sucursal.
              </p>
            </aside>
          </div>

          <div className="mpc-result-actions">
            <button
              type="button"
              className="mpc-reject-button"
              onClick={cancelarTurno}
              disabled={procesando}
            >
              ✕ &nbsp;
              {procesando ? "Cancelando..." : "Cancelar turno"}
            </button>

            <button
              type="button"
              className="mpc-continue-button"
              onClick={reiniciar}
              disabled={procesando}
            >
              Salir　❯
            </button>
          </div>
        </main>
      )}

      {pantalla === "turno-existente" && turnoExistente && (
        <main className="mpc-result-screen">
          <div className="mpc-success-icon" aria-hidden="true">
            ✓
          </div>

          <h1>
            {turnoExistente.estado === "reservado"
              ? "Encontramos tu reserva virtual"
              : turnoExistente.estado === "en_espera"
                ? "Tu turno está en espera"
                : "Ya tienes un turno activo"}
          </h1>

          <p className="mpc-result-subtitle">
            {turnoExistente.estado === "reservado"
              ? "Esta reserva no es una cita. Debes activar tu turno al llegar a la sucursal."
              : turnoExistente.estado === "en_espera"
                ? "Tu turno está activo. Espera a que te llamen."
                : "No necesitas generar otro turno."}
          </p>

          <div className="mpc-result-ticket mpc-existing-ticket">
            <div className="mpc-result-code">
              {turnoExistente.codigo}
            </div>

            <p>
              Servicio:{" "}
              {nombreServicio(turnoExistente.servicio_id)}
            </p>

            <p>
              Estado: {nombreEstado(turnoExistente.estado)}
            </p>

            {turnoExistente.fecha_hora_programada && (
              <p>
                Hora reservada:{" "}
                {fechaHoraColombia(
                  turnoExistente.fecha_hora_programada
                )}
              </p>
            )}
          </div>

          {turnoExistente.estado === "reservado" && (
            <aside className="mpc-virtual-panel">
              <div className="mpc-phone-icon" aria-hidden="true">
                ▯
              </div>

              <strong>¿Ya llegaste a la sucursal?</strong>

              <p>
                Activa tu turno desde 10 minutos antes y hasta
                30 minutos después de la hora reservada. Después
                de activarlo, espera a que te llamen.
              </p>

              <button
                type="button"
                className="mpc-activate-button"
                onClick={activarReservaExistente}
                disabled={procesando}
              >
                {procesando
                  ? "Activando turno..."
                  : "Activar turno"}
              </button>
            </aside>
          )}

          {turnoExistente.estado === "en_espera" && (
            <aside className="mpc-virtual-panel">
              <strong>¡Tu turno está activo!</strong>
              <p>
                Tu turno ya se encuentra en la fila de espera.
                Por favor, espera a que te llamen.
              </p>
            </aside>
          )}

          <button
            type="button"
            className="mpc-continue-button"
            onClick={reiniciar}
            disabled={procesando}
          >
            Salir
          </button>
        </main>
      )}

      <footer className="mpc-footer">
        Módulo de Punto de Contacto · Gestión de Turnos
      </footer>
    </div>
  );
}

export default MPC;

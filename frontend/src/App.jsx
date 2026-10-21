
import { useCallback, useEffect, useState } from "react";
import "./App.css";

import {
  consultarTurnos,
  llamarSiguiente as llamarSiguienteAPI,
  marcarAusente,
  retenerTurno,
  reactivarTurno,
  documentarTurno,
  finalizarTurno,
  limpiarTodosLosTurnos,
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
    cargarTurnos();
  }, [cargarTurnos]);

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

  return (
    <div className="aplicacion">
      <header className="encabezado">
        <div>
          <p className="subtitulo">SISTEMA DE ATENCIÓN</p>
          <h1>Gestión de turnos</h1>
        </div>

        <div className="sucursal">
          <span className="indicador"></span>
          Sucursal Principal de Prueba
        </div>
      </header>

      <main className="contenido">
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
                          )}

                          {turno.estado === "en_espera" && (
                            <span>Sin acciones disponibles</span>
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
      </main>

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
    </div>
  );
}

export default App;

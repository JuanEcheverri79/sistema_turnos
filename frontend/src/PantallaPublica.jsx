
import { useCallback, useEffect, useState } from "react";
import { consultarPantallaPublica } from "./api";
import "./PantallaPublica.css";

const SUCURSAL_ID = 1;
const INTERVALO_ACTUALIZACION = 3000;

const SERVICIOS = [
  { id: 1, nombre: "CAJA" },
  { id: 2, nombre: "ASESORÍA" },
];

function hora(fecha) {
  if (!fecha) return "--:--";

  const valor = new Date(fecha);

  if (Number.isNaN(valor.getTime())) return "--:--";

  return valor.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  });
}

function PantallaPublica() {
  const [datos, setDatos] = useState({
    turnos_actuales: [],
    ultimos_llamados: [],
    turnos_proximos: [],
  });

  const [error, setError] = useState("");
  const [actualizado, setActualizado] = useState(null);
  const [fechaHora, setFechaHora] = useState(() => new Date());

  // Actualizar fecha y hora cada segundo.
  useEffect(() => {
    const intervaloReloj = window.setInterval(() => {
      setFechaHora(new Date());
    }, 1000);

    return () => window.clearInterval(intervaloReloj);
  }, []);

  // Consultar los turnos del backend.
  const cargarDatos = useCallback(async () => {
    try {
      const respuesta = await consultarPantallaPublica(SUCURSAL_ID);

      setDatos({
        turnos_actuales: respuesta.turnos_actuales ?? [],
        ultimos_llamados: respuesta.ultimos_llamados ?? [],
        turnos_proximos: respuesta.turnos_proximos ?? [],
      });

      setError("");
      setActualizado(new Date());
    } catch (err) {
      setError(
        err?.message || "No se pudo conectar con el servidor."
      );
    }
  }, []);

  useEffect(() => {
    cargarDatos();

    const intervalo = window.setInterval(
      cargarDatos,
      INTERVALO_ACTUALIZACION
    );

    return () => window.clearInterval(intervalo);
  }, [cargarDatos]);

  // Ordenar los turnos llamados del más reciente al más antiguo.
  const turnosEnAtencion = [...datos.ultimos_llamados].sort(
    (a, b) =>
      new Date(b.llamado_en || 0).getTime() -
      new Date(a.llamado_en || 0).getTime()
  );

  const ultimoLlamado = turnosEnAtencion[0] ?? null;

  function turnosPorServicio(servicioId) {
    return datos.turnos_proximos.filter(
      (turno) => Number(turno.servicio_id) === servicioId
    );
  }

  function llamadosPorServicio(servicioId) {
    return turnosEnAtencion.filter(
      (turno) => Number(turno.servicio_id) === servicioId
    );
  }

  return (
    <main className="tablero-publico">
      {/* ENCABEZADO: LOGO, FECHA Y HORA, CONEXIÓN */}
      <header className="tablero-encabezado">
        <div className="marca-banco">
          <img
            className="marca-logo"
            src="/bancolombia-logo.png"
            alt="Bancolombia"
          />
        </div>

        <div className="reloj-central">
          <div className="reloj-fecha">
            {fechaHora.toLocaleDateString("es-CO", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "America/Bogota",
            })}
          </div>

          <div className="reloj-hora">
            {fechaHora.toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
              timeZone: "America/Bogota",
            })}
          </div>
        </div>

        <div className="estado-conexion">
          <span
            className={`conexion-punto ${
              error ? "conexion-error" : ""
            }`}
          />
          {error ? "Sin conexión" : "Pantalla de turnos"}
        </div>
      </header>

      {error && (
        <div className="tablero-error" role="alert">
          {error}. Reintentando conexión...
        </div>
      )}

      <div className="tablero-layout">
        {/* PRÓXIMOS TURNOS */}
        <aside className="bloque-panel bloque-proximos">
          <h2 className="titulo-bloque">Próximos turnos</h2>

          <p className="descripcion-bloque">
            Turnos pendientes de llamado
          </p>

          {SERVICIOS.map((servicio) => {
            const turnos = turnosPorServicio(servicio.id);

            return (
              <section className="grupo-turnos" key={servicio.id}>
                <h3>{servicio.nombre}</h3>

                {turnos.length > 0 ? (
                  turnos.slice(0, 3).map((turno) => (
                    <div className="turno-proximo" key={turno.id}>
                      {turno.codigo}
                    </div>
                  ))
                ) : (
                  <p className="sin-turnos">
                    Sin turnos pendientes
                  </p>
                )}
              </section>
            );
          })}
        </aside>

        {/* COLUMNA CENTRAL */}
        <section className="columna-central">
          {/* TURNO LLAMADO ACTUALMENTE */}
          <section className="bloque-panel bloque-llamado">
            <p className="etiqueta-bloque">
              TURNO LLAMADO ACTUALMENTE
            </p>

            {ultimoLlamado ? (
              <>
                <h1
                  className="codigo-llamado"
                  key={ultimoLlamado.id}
                >
                  {ultimoLlamado.codigo}
                </h1>

                <p className="texto-modulo">
                  Por favor, diríjase al módulo
                </p>

                <div className="modulo-llamado">
                  {ultimoLlamado.modulo ?? "—"}
                </div>

                <p className="hora-llamado">
                  Hora del llamado:{" "}
                  {hora(ultimoLlamado.llamado_en)}
                </p>
              </>
            ) : (
              <div className="sin-llamado">
                <h1>Bienvenido</h1>
                <p>
                  En este momento no hay turnos en atención.
                </p>
              </div>
            )}
          </section>

          {/* PUBLICIDAD */}
          <section className="bloque-panel bloque-publicidad">
            <div className="franja-publicidad">
              DESCUBRE LOS BENEFICIOS DE BANCOLOMBIA
            </div>

            <div className="contenido-publicidad">
              <div className="publicidad-mensaje">
                <span className="publicidad-acento" />

                <h2>Estamos para acompañarte</h2>

                <p>
                  Descubre alternativas de ahorro, financiación
                  y beneficios para acompañar tus proyectos.
                </p>

                <a
                  className="publicidad-enlace"
                  href="https://www.bancolombia.com/personas/beneficios/ofertas"
                  target="_blank"
                  rel="noreferrer"
                >
                  Conoce nuestras ofertas
                </a>
              </div>

              <img
                className="publicidad-imagen"
                src="/bancolombia-publicidad.jpg"
                alt="Imagen institucional de referencia de Bancolombia"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          </section>

          {/* INFORMACIÓN DE LA OFICINA */}
          <section className="bloque-panel bloque-oficina">
            <h2>INFORMACIÓN SOBRE LA OFICINA</h2>

            <p>
              Sucursal Principal de Prueba · Medellín
            </p>

            <p>
              Sigue las indicaciones de nuestros asesores y
              verifica el módulo que aparece junto a tu turno.
            </p>
          </section>
        </section>

        {/* TURNOS EN ATENCIÓN */}
        <aside className="bloque-panel bloque-historial">
          <h2 className="titulo-bloque">Turnos en atención</h2>

          <p className="descripcion-bloque">
            Turnos que siguen siendo atendidos
          </p>

          {SERVICIOS.map((servicio) => {
            const turnos = llamadosPorServicio(servicio.id);

            return (
              <section
                className="grupo-historial"
                key={servicio.id}
              >
                <h3>{servicio.nombre}</h3>

                {turnos.length > 0 ? (
                  turnos.map((turno) => (
                    <div
                      className="registro-llamado"
                      key={turno.id}
                    >
                      <strong>{turno.codigo}</strong>

                      <span>
                        Módulo {turno.modulo ?? "—"}
                      </span>

                      <small>
                        Llamado: {hora(turno.llamado_en)}
                      </small>
                    </div>
                  ))
                ) : (
                  <p className="sin-turnos">
                    Sin turnos en atención
                  </p>
                )}
              </section>
            );
          })}
        </aside>
      </div>

      {/* PIE DE PANTALLA */}
      <footer className="tablero-pie">
        <span>
          Por favor, esté atento a los llamados y diríjase al
          módulo indicado.
        </span>

        <span>
          {actualizado
            ? `Actualizado ${hora(actualizado)}`
            : "Conectando..."}
        </span>
      </footer>
    </main>
  );
}

export default PantallaPublica;

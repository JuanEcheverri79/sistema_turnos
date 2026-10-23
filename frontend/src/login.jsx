
import { useState } from "react";
import { iniciarSesion } from "./api";
import "./login.css";

export default function Login({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function manejarInicioSesion(evento) {
    evento.preventDefault();
    setError("");
    setCargando(true);

    try {
      const datos = await iniciarSesion(usuario, clave);

      if (typeof onLogin === "function") {
        onLogin(datos);
      }
    } catch (err) {
      setError(
        err?.message || "No fue posible iniciar sesión."
      );
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-icon" aria-hidden="true">
          <span>ST</span>
        </div>

        <h1>Sistema de Gestión de Turnos</h1>

        <p className="login-subtitle">
          Ingresa tus credenciales para acceder a la consola.
        </p>

        <form onSubmit={manejarInicioSesion}>
          <div className="login-field">
            <label htmlFor="usuario">Usuario</label>
            <input
              id="usuario"
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="Ingresa tu usuario"
              autoComplete="username"
              required
              disabled={cargando}
            />
          </div>

          <div className="login-field">
            <label htmlFor="clave">Contraseña</label>
            <input
              id="clave"
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder="Ingresa tu contraseña"
              autoComplete="current-password"
              required
              disabled={cargando}
            />
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="login-button"
            type="submit"
            disabled={cargando}
          >
            {cargando ? "Validando..." : "Iniciar sesión"}
          </button>
        </form>

        <p className="login-footer">
          Acceso exclusivo para operadores autorizados.
        </p>
      </section>
    </main>
  );
}

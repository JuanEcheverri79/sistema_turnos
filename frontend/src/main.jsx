
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import "./index.css";
import App from "./App.jsx";
import PantallaPublica from "./PantallaPublica.jsx";
import MPC from "./MPC.jsx";
import Reservas from "./Reservas.jsx";



createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route
          path="/pantalla-publica"
          element={<PantallaPublica />}
        />
        <Route path="/mpc" element={<MPC />} />
        <Route path="/reservas" element={<Reservas />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);

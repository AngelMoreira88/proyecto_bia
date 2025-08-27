import React from "react";

export default function Footer() {
  return (
    <footer className="footer-bia bg-bia-light-gray text-bia-dark py-3 mt-auto">
      <div className="container d-flex flex-column flex-md-row justify-content-between align-items-center text-center text-md-start">
        
        {/* Izquierda: Teléfono y horario */}
        <div className="d-flex flex-column align-items-center align-items-md-start mb-2 mb-md-0">
          <div className="fw-semibold">ATENCIÓN TELEFÓNICA: +54 11 6009-2233</div>
          <small>Horario: Abrimos hoy 10:00 a. m. – 03:30 p. m. (ARG)</small>
        </div>

        {/* Divisor visible solo en pantallas medianas+ */}
        <div className="divider-vertical d-none d-md-block"></div>

        {/* Derecha: Copyright */}
        <div className="text-center text-md-end">
          <small>
            © 2025 <strong>Grupo BIA</strong> — Todos los derechos reservados.
          </small>
        </div>
      </div>
    </footer>
  );
}

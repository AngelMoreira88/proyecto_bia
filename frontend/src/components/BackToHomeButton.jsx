// src/components/BackToHomeButton.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import useHomePath from "../hooks/useHomePath";

export default function BackToHomeButton({
  children = "Volver",
  className = "btn btn-outline-bia",
  icon = true,
  onBeforeNavigate, // opcional: callback antes de navegar
}) {
  const navigate = useNavigate();
  const homePath = useHomePath();

  const handleClick = () => {
    if (typeof onBeforeNavigate === "function") onBeforeNavigate();
    navigate(homePath);
  };

  return (
    <button className={className} onClick={handleClick}>
      {icon && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className="me-2"
          aria-hidden="true"
        >
          <path
            d="M15 19l-7-7 7-7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

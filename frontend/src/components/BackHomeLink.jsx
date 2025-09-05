// src/components/BackHomeLink.jsx
import React from "react";
import { Link } from "react-router-dom";
import useHomePath from "../hooks/useHomePath";

export default function BackHomeLink({
  children = "Volver al home",
  className = "btn btn-outline-bia",
  icon = true,
  ...rest
}) {
  const homePath = useHomePath();
  return (
    <Link className={className} to={homePath} {...rest}>
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
    </Link>
  );
}

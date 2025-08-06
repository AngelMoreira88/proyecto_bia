// frontend/src/components/PrivateRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { isLoggedIn } from "../services/auth";

export default function PrivateRoute({ children }) {
  const location = useLocation();

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

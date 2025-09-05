// src/hooks/useHomePath.js
import { isLoggedIn } from "../services/auth";

export default function useHomePath() {
  return isLoggedIn() ? "/portal" : "/";
}

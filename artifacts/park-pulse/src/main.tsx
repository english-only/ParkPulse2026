import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyInitialTheme } from "./hooks/useTheme";
import "./index.css";

// Set the theme attribute before React mounts so the first paint already uses
// the right palette and there is no flash of the default colours.
applyInitialTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
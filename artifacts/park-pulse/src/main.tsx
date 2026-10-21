import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyInitialTheme } from "./hooks/useTheme";
import "./index.css";
import "./styles/field-atlas.css";
import "./styles/explore-atlas.css";
import "./styles/type.css";
import "./styles/contribute.css";

// Set the theme attribute before React mounts so the first paint already uses
// the right palette and there is no flash of the default colours.
applyInitialTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
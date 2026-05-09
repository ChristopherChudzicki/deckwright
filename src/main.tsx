import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ensureIcons } from "./cards/resolveIcon";
import "./index.css";
import "@fontsource-variable/inter/index.css";
import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/600.css";

void ensureIcons();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ensureIcons } from "./cards/resolveIcon";
import { invariant } from "./lib/invariant";
import "./index.css";
import "@fontsource-variable/inter/index.css";
import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/600.css";

void ensureIcons();

const rootEl = document.getElementById("root");
invariant(rootEl, "#root element missing from index.html");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// SSTPA Tools Frontend entry point. Before the first render, resolve the
// launch configuration handed over by the Startup Software (SRS §4): backend
// URL and pre-authenticated session, so the user signs in exactly once.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/sstpa-default.css";
import App from "./App";
import { api, initLaunchConfig, setToken } from "./api/client";
import { useSession } from "./state/stores";
import { initStyle } from "./styles/styles";

async function start() {
  initStyle();
  const cfg = await initLaunchConfig();
  if (cfg?.token) {
    setToken(cfg.token);
    try {
      const me = await api.me();
      useSession.getState().login(me.user, cfg.token);
    } catch {
      // Stale or revoked session: fall back to the login screen.
      setToken(null);
    }
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();

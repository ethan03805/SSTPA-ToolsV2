// Login screen (SRS §4): verifies user name and password with the Backend
// before entering the GUI. Also offers first-run RootAdmin bootstrap.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useSession } from "../state/stores";

export function LoginScreen() {
  const login = useSession((s) => s.login);
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // First-run detection (SRS §3.2): present the RootAdmin creation form
  // automatically when this installation has no RootAdmin yet.
  useEffect(() => {
    api
      .authStatus()
      .then((s) => {
        if (!s.rootAdminExists) setMode("bootstrap");
      })
      .catch(() => {
        /* backend unreachable — the login submit will surface it */
      });
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "bootstrap") {
        await api.bootstrap(userName, password, email);
      }
      const res = await api.login(userName, password);
      login(res.user, res.token);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError("A RootAdmin already exists — use Sign in.");
      } else if (e instanceof ApiError) {
        setError(e.detail ? `${e.message} (${e.detail})` : e.message);
      } else {
        setError("Cannot reach the Backend. Is it running?");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="sstpa-frame"
        style={{ width: 420, padding: "var(--sstpa-sp-6)" }}
      >
        <div style={{ textAlign: "center", marginBottom: "var(--sstpa-sp-4)" }}>
          <img src="/sstpa-logo-large.png" alt="SSTPA Tools" style={{ maxWidth: 220 }} />
          <h1
            className="branding-title"
            style={{ margin: "var(--sstpa-sp-2) 0 0", fontSize: "1.6rem" }}
          >
            SSTPA Tools
          </h1>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          style={{ display: "flex", flexDirection: "column", gap: "var(--sstpa-sp-3)" }}
        >
          <label style={{ fontSize: "0.82rem" }}>
            User name
            <input
              className="sstpa-input"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </label>
          <label style={{ fontSize: "0.82rem" }}>
            Password
            <input
              className="sstpa-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {mode === "bootstrap" && (
            <label style={{ fontSize: "0.82rem" }}>
              Email
              <input
                className="sstpa-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {error && <div className="sstpa-alert-warning">{error}</div>}
          <button className="sstpa-button" disabled={busy || !userName || !password}>
            {mode === "login" ? "Sign in" : "Create RootAdmin & sign in"}
          </button>
          <button
            type="button"
            className="sstpa-button secondary"
            onClick={() => setMode(mode === "login" ? "bootstrap" : "login")}
          >
            {mode === "login"
              ? "First installation? Create the RootAdmin account"
              : "Back to sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

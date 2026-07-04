// Startup Software flow (SRS §4):
// 1. start (or connect to) the Backend on the local machine
// 2. first run: create the RootAdmin (SRS §3.2 "the Installer becomes the
//    RootAdmin"); otherwise verify user name and password with the Backend
// 3. launch the Frontend with the backend URL and session handed over
// 4. on Frontend exit, assure Backend shuts down preserving data
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

const { invoke } = window.__TAURI__.core;

const statusEl = document.getElementById("status");
const loginEl = document.getElementById("login");
const bootstrapEl = document.getElementById("bootstrap");
const goBtn = document.getElementById("go");
const bsBtn = document.getElementById("bs-go");

function setStatus(text, cls = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${cls}`;
  // The mark pulses only while work is in flight.
  document.getElementById("mark").classList.toggle("busy", cls === "");
}

async function boot() {
  try {
    setStatus("Starting Backend…\n(docker compose up)");
    await invoke("start_backend");
    setStatus("Waiting for Backend to become healthy…");
    await invoke("wait_backend_healthy");
    const hasRootAdmin = await invoke("auth_status");
    if (hasRootAdmin) {
      setStatus("Backend connected. Sign in to continue.", "ok");
      loginEl.style.display = "block";
      document.getElementById("user").focus();
    } else {
      setStatus("Backend connected. First run — create the RootAdmin.", "ok");
      bootstrapEl.style.display = "block";
      document.getElementById("bs-user").focus();
    }
  } catch (e) {
    setStatus(`Backend startup failed:\n${e}`, "error");
  }
}

async function launch(token, userName) {
  setStatus("Launching SSTPA Tools GUI…", "ok");
  await invoke("launch_frontend", { token, userName });
  // The Rust side watches the GUI process; when it exits, the Backend is
  // stopped cleanly and this Startup application exits (SRS §4).
  setStatus("SSTPA Tools is running.\nThis window will close on shutdown.", "ok");
}

loginEl.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  goBtn.disabled = true;
  const userName = document.getElementById("user").value.trim();
  const password = document.getElementById("pass").value;
  try {
    setStatus("Verifying credentials with Backend…");
    const token = await invoke("verify_login", { userName, password });
    await launch(token, userName);
  } catch (e) {
    setStatus(`${e}`, "error");
    goBtn.disabled = false;
  }
});

bootstrapEl.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const userName = document.getElementById("bs-user").value.trim();
  const email = document.getElementById("bs-email").value.trim();
  const password = document.getElementById("bs-pass").value;
  const confirm = document.getElementById("bs-pass2").value;
  if (!userName || !email || !password) {
    setStatus("User name, email, and password are all required.", "error");
    return;
  }
  if (password !== confirm) {
    setStatus("Passwords do not match.", "error");
    return;
  }
  if (password.length < 8) {
    setStatus("Choose a password of at least 8 characters.", "error");
    return;
  }
  bsBtn.disabled = true;
  try {
    setStatus("Creating RootAdmin account…");
    await invoke("bootstrap_root_admin", { userName, password, email });
    setStatus("RootAdmin created. Signing in…", "ok");
    const token = await invoke("verify_login", { userName, password });
    await launch(token, userName);
  } catch (e) {
    setStatus(`${e}`, "error");
    bsBtn.disabled = false;
  }
});

boot();

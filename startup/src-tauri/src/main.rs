// SSTPA Tools Startup Software (SRS §4).
//
// Flow: start the Backend (docker compose up), wait for it to become
// healthy, authenticate the user (creating the RootAdmin on first run,
// SRS §3.2), then launch the Frontend GUI with the backend URL and session
// handed over; when the GUI exits, stop the Backend cleanly.
//
// 2025 Nicholas Triska. All rights reserved.
// The SSTPA Tools software and all associated modules, binaries, and source
// code are proprietary intellectual property of Nicholas Triska. Unauthorized
// reproduction, modification, or distribution is strictly prohibited. Licensed
// copies may be used under specific contractual terms provided by the author.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Directory holding docker-compose.yml. Defaults to the deploy directory
/// installed alongside the application; overridable for development.
fn deploy_dir() -> PathBuf {
    if let Ok(dir) = env::var("SSTPA_DEPLOY_DIR") {
        return PathBuf::from(dir);
    }
    // Installed layout: <install>/deploy next to the startup binary.
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidate = parent.join("deploy");
            if candidate.join("docker-compose.yml").exists() {
                return candidate;
            }
            // Installed bundle layout (bundles/startup/bin/… → <install>/deploy)
            // and repository layout (development): walk up to six levels.
            let mut dir = parent.to_path_buf();
            for _ in 0..6 {
                let candidate = dir.join("deploy");
                if candidate.join("docker-compose.yml").exists() {
                    return candidate;
                }
                if !dir.pop() {
                    break;
                }
            }
        }
    }
    PathBuf::from(".")
}

/// Base URL of the Caddy edge (SRS §5.4: reverse proxy on 443). Resolution
/// order: SSTPA_BACKEND_URL env → SSTPA_HTTPS_PORT in <deploy>/.env →
/// https://localhost.
fn backend_base() -> String {
    if let Ok(url) = env::var("SSTPA_BACKEND_URL") {
        return url.trim_end_matches('/').to_string();
    }
    let env_file = deploy_dir().join(".env");
    if let Ok(contents) = std::fs::read_to_string(env_file) {
        for line in contents.lines() {
            if let Some(port) = line.trim().strip_prefix("SSTPA_HTTPS_PORT=") {
                let port = port.trim();
                if !port.is_empty() && port != "443" {
                    return format!("https://localhost:{port}");
                }
            }
        }
    }
    "https://localhost".to_string()
}

/// Run curl (bundled on Windows 10+, macOS, and virtually all Linux) against
/// the local Caddy edge. `-k` accepts Caddy's internal CA (SRS §5.4 local
/// TLS); the body, when given, is passed via stdin so credentials never
/// appear in the process list.
fn curl_json(method: &str, url: &str, body: Option<&str>) -> Result<(u16, String), String> {
    let mut cmd = Command::new("curl");
    cmd.args(["-sk", "--max-time", "10", "-X", method, "-w", "\n%{http_code}"]);
    if body.is_some() {
        cmd.args(["-H", "Content-Type: application/json", "-d", "@-"]);
        cmd.stdin(Stdio::piped());
    }
    cmd.arg(url);
    cmd.stdout(Stdio::piped()).stderr(Stdio::null());
    let mut child = cmd.spawn().map_err(|e| format!("cannot run curl: {e}"))?;
    if let Some(payload) = body {
        child
            .stdin
            .take()
            .ok_or("no stdin")?
            .write_all(payload.as_bytes())
            .map_err(|e| format!("cannot write request body: {e}"))?;
    }
    let out = child
        .wait_with_output()
        .map_err(|e| format!("curl failed: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout);
    let (resp_body, code_line) = text.rsplit_once('\n').unwrap_or(("", text.trim()));
    let code: u16 = code_line.trim().parse().unwrap_or(0);
    Ok((code, resp_body.to_string()))
}

/// Start the Backend on the local machine (SRS §4): docker compose up -d.
#[tauri::command]
fn start_backend() -> Result<(), String> {
    let dir = deploy_dir();
    if !dir.join("docker-compose.yml").exists() {
        return Err(format!(
            "docker-compose.yml not found (looked in {}). Set SSTPA_DEPLOY_DIR.",
            dir.display()
        ));
    }
    if !dir.join(".env").exists() {
        return Err(format!(
            "{}/.env not found. Run the installer (install.sh / install.ps1), which generates it, or create it from the deployment documentation.",
            dir.display()
        ));
    }
    let out = Command::new("docker")
        .args(["compose", "up", "-d"])
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("cannot run docker: {e}. Is Docker installed and running?"))?;
    if !out.status.success() {
        return Err(format!(
            "docker compose up failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

/// Poll the Backend until it answers through the reverse proxy. Polls
/// /api/capability — /healthz is not proxied, and Caddy's catch-all would
/// answer 200 even with the Backend down.
#[tauri::command]
fn wait_backend_healthy() -> Result<(), String> {
    let url = format!("{}/api/capability", backend_base());
    let deadline = Instant::now() + Duration::from_secs(180);
    loop {
        if let Ok((200, _)) = curl_json("GET", &url, None) {
            return Ok(());
        }
        if Instant::now() > deadline {
            return Err(format!(
                "Backend did not become healthy within 180 s ({url})."
            ));
        }
        std::thread::sleep(Duration::from_secs(2));
    }
}

/// First-run detection (SRS §3.2): does this installation have a RootAdmin?
#[tauri::command]
fn auth_status() -> Result<bool, String> {
    let url = format!("{}/api/auth/status", backend_base());
    match curl_json("GET", &url, None)? {
        (200, body) => Ok(body.contains("\"rootAdminExists\":true")),
        (code, _) => Err(format!("Backend auth status failed (HTTP {code}).")),
    }
}

/// Create the RootAdmin account on first run (SRS §3.2: "The Installer of
/// SSTPA Tools becomes the RootAdmin").
#[tauri::command]
fn bootstrap_root_admin(user_name: String, password: String, email: String) -> Result<(), String> {
    let body = serde_json::json!({
        "userName": user_name, "password": password, "email": email
    });
    let url = format!("{}/api/auth/bootstrap", backend_base());
    match curl_json("POST", &url, Some(&body.to_string()))? {
        (201, _) => Ok(()),
        (409, _) => Err("A RootAdmin already exists for this installation.".into()),
        (code, resp) => Err(format!("Account creation failed (HTTP {code}): {resp}")),
    }
}

/// Verify user name and password with the Backend before launching the
/// Frontend (SRS §4). Returns the session token so the GUI does not require
/// a second login.
#[tauri::command]
fn verify_login(user_name: String, password: String) -> Result<String, String> {
    let body = serde_json::json!({ "userName": user_name, "password": password });
    let url = format!("{}/api/auth/login", backend_base());
    match curl_json("POST", &url, Some(&body.to_string()))? {
        (200, resp) => {
            let parsed: serde_json::Value =
                serde_json::from_str(&resp).map_err(|e| format!("bad login response: {e}"))?;
            parsed["token"]
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| "login response carried no token".into())
        }
        (401, _) => Err("Invalid user name or password.".into()),
        (403, resp) => Err(format!("Account is not active: {resp}")),
        (code, _) => Err(format!("Backend login check failed (HTTP {code}).")),
    }
}

/// Locate the Frontend GUI binary: env override, then next to this binary,
/// then the installed bundles/frontend/bin layout, then macOS .app bundles.
fn frontend_bin() -> Result<PathBuf, String> {
    if let Ok(bin) = env::var("SSTPA_GUI_BIN") {
        return Ok(PathBuf::from(bin));
    }
    let exe = env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("no parent dir")?;
    let name = if cfg!(windows) {
        "sstpa-tools-gui.exe"
    } else {
        "sstpa-tools-gui"
    };
    let sibling = dir.join(name);
    if sibling.exists() {
        return Ok(sibling);
    }
    // Installed layout: <install>/bundles/startup/bin/sstpa-startup →
    // <install>/bundles/frontend/bin/sstpa-tools-gui.
    if let Some(bundles_dir) = dir.parent().and_then(|startup_dir| startup_dir.parent()) {
        let packaged = bundles_dir.join("frontend").join("bin").join(name);
        if packaged.exists() {
            return Ok(packaged);
        }
        // Native macOS bundle staged by the installer.
        let mac_app = bundles_dir
            .join("frontend")
            .join("macos")
            .join("SSTPA Tools.app")
            .join("Contents")
            .join("MacOS")
            .join(name);
        if mac_app.exists() {
            return Ok(mac_app);
        }
    }
    Err(format!(
        "Frontend binary {name} not found next to Startup or under bundles/frontend. Set SSTPA_GUI_BIN."
    ))
}

/// Launch the Frontend with the backend URL and authenticated session in its
/// environment, watch it, and on its exit stop the Backend cleanly (SRS §4:
/// don't kill the database while transactions are in process — `docker
/// compose stop` sends SIGTERM and Neo4j checkpoints on shutdown).
#[tauri::command]
fn launch_frontend(app: tauri::AppHandle, token: String, user_name: String) -> Result<(), String> {
    let bin = frontend_bin()?;
    let mut child = Command::new(&bin)
        .env("SSTPA_BACKEND_URL", backend_base())
        .env("SSTPA_SESSION_TOKEN", token)
        .env("SSTPA_USER_NAME", user_name)
        .spawn()
        .map_err(|e| format!("cannot launch {}: {e}", bin.display()))?;
    std::thread::spawn(move || {
        let _ = child.wait();
        // Frontend exited (Shutdown icon or window close): stop the Backend.
        let dir = deploy_dir();
        let _ = Command::new("docker")
            .args(["compose", "stop"])
            .current_dir(&dir)
            .output();
        app.exit(0);
    });
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            start_backend,
            wait_backend_healthy,
            auth_status,
            bootstrap_root_admin,
            verify_login,
            launch_frontend
        ])
        .run(tauri::generate_context!())
        .expect("error while running SSTPA Startup Software");
}

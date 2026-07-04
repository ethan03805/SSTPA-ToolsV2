// SSTPA Tools Startup Software (SRS §4).
//
// 2025 Nicholas Triska. All rights reserved.
// The SSTPA Tools software and all associated modules, binaries, and source
// code are proprietary intellectual property of Nicholas Triska. Unauthorized
// reproduction, modification, or distribution is strictly prohibited. Licensed
// copies may be used under specific contractual terms provided by the author.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::path::PathBuf;
use std::process::Command;
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
            // Repository layout (development): ../../..//deploy
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

fn backend_base() -> String {
    env::var("SSTPA_BACKEND_URL").unwrap_or_else(|_| "https://localhost:8543".into())
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
    let out = Command::new("docker")
        .args(["compose", "up", "-d"])
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("cannot run docker: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "docker compose up failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

/// Poll the Backend health endpoint until it responds (or time out).
#[tauri::command]
fn wait_backend_healthy() -> Result<(), String> {
    let url = format!("{}/healthz", backend_base());
    let deadline = Instant::now() + Duration::from_secs(180);
    loop {
        let ok = Command::new("curl")
            .args(["-sk", "--max-time", "3", "-o", "/dev/null", "-w", "%{http_code}", &url])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "200")
            .unwrap_or(false);
        if ok {
            return Ok(());
        }
        if Instant::now() > deadline {
            return Err("Backend did not become healthy within 180 s".into());
        }
        std::thread::sleep(Duration::from_secs(2));
    }
}

/// Verify user name and password with the Backend before launching the
/// Frontend (SRS §4).
#[tauri::command]
fn verify_login(user_name: String, password: String) -> Result<(), String> {
    let body = serde_json::json!({ "userName": user_name, "password": password });
    let out = Command::new("curl")
        .args([
            "-sk",
            "--max-time",
            "10",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            "-X",
            "POST",
            "-H",
            "Content-Type: application/json",
            "-d",
            &body.to_string(),
            &format!("{}/api/auth/login", backend_base()),
        ])
        .output()
        .map_err(|e| format!("cannot run curl: {e}"))?;
    match String::from_utf8_lossy(&out.stdout).trim() {
        "200" => Ok(()),
        "401" => Err("Invalid user name or password.".into()),
        code => Err(format!("Backend login check failed (HTTP {code}).")),
    }
}

/// Locate the Frontend GUI binary: env override, then next to this binary,
/// then the development cargo target directory.
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
    if let Some(bundles_dir) = dir.parent().and_then(|startup_dir| startup_dir.parent()) {
        let packaged = bundles_dir.join("frontend").join("bin").join(name);
        if packaged.exists() {
            return Ok(packaged);
        }
    }
    Err(format!(
        "Frontend binary {name} not found next to Startup or under bundles/frontend/bin. Set SSTPA_GUI_BIN."
    ))
}

/// Launch the Frontend, watch it, and on its exit stop the Backend cleanly
/// (SRS §4: don't kill the database while transactions are in process —
/// `docker compose stop` sends SIGTERM and Neo4j checkpoints on shutdown).
#[tauri::command]
fn launch_frontend(app: tauri::AppHandle) -> Result<(), String> {
    let bin = frontend_bin()?;
    let mut child = Command::new(&bin)
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
            verify_login,
            launch_frontend
        ])
        .run(tauri::generate_context!())
        .expect("error while running SSTPA Startup Software");
}

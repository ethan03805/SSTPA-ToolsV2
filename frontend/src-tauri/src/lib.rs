// SSTPA Tools Frontend — Tauri shell (SRS §6.2: standalone desktop
// application in a single window).
//
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

/// Shutdown command invoked by the GUI's red Shutdown icon (SRS §6.3.2).
/// The Frontend process exits; the Startup Software observes child-process
/// exit and stops the Backend cleanly (SRS §4).
#[tauri::command]
fn request_shutdown(app: tauri::AppHandle) {
    app.exit(0);
}

/// Launch configuration handed over by the Startup Software (SRS §4): the
/// backend base URL and the already-authenticated session, so the user does
/// not sign in twice.
#[derive(serde::Serialize)]
struct LaunchConfig {
    backend_url: Option<String>,
    token: Option<String>,
    user_name: Option<String>,
}

#[tauri::command]
fn launch_config() -> LaunchConfig {
    let read = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());
    LaunchConfig {
        backend_url: read("SSTPA_BACKEND_URL"),
        token: read("SSTPA_SESSION_TOKEN"),
        user_name: read("SSTPA_USER_NAME"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![request_shutdown, launch_config])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

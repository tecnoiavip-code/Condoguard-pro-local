#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::env;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager, State};
use wait_timeout::ChildExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServerStatus {
  running: bool,
  port: Option<u16>,
  data_dir: Option<String>,
}

struct AppState {
  server: Mutex<Option<Child>>,
  server_port: Mutex<Option<u16>>,
  data_dir: Mutex<Option<PathBuf>>,
}

fn get_data_dir() -> PathBuf {
  if let Ok(dir) = env::var("PORTALGUARD_DATA_DIR") {
    return PathBuf::from(dir);
  }
  if let Ok(pd) = env::var("ProgramData") {
    return PathBuf::from(pd).join("PortalGuard");
  }
  if let Some(p) = dirs::data_dir() {
    return p.join("PortalGuard");
  }
  if let Some(home) = dirs::home_dir() {
    return home.join("AppData").join("Roaming").join("PortalGuard");
  }
  PathBuf::from("C:/ProgramData/PortalGuard")
}

fn get_storage_dir(data_dir: &PathBuf) -> PathBuf {
  if let Ok(dir) = env::var("PORTALGUARD_STORAGE_DIR") {
    return PathBuf::from(dir);
  }
  data_dir.join("storage")
}

fn get_port() -> u16 {
  if let Ok(p) = env::var("PORTALGUARD_PORT") {
    if let Ok(v) = p.parse::<u16>() {
      if v > 0 {
        return v;
      }
    }
  }
  portpicker::pick_unused_port().unwrap_or(8080)
}

#[tauri::command]
fn get_server_status(state: State<AppState>) -> ServerStatus {
  let server = state.server.lock().unwrap();
  let port = state.server_port.lock().unwrap();
  let data_dir = state.data_dir.lock().unwrap();
  ServerStatus {
    running: server.is_some(),
    port: *port,
    data_dir: data_dir.as_ref().map(|p| p.to_string_lossy().to_string()),
  }
}

fn get_web_dir(resource_dir: &PathBuf) -> Option<PathBuf> {
  let exe_dir = env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf()))?;
  for base in [resource_dir.join("dist"), exe_dir.join("dist")] {
    if base.join("index.html").exists() {
      return Some(base);
    }
  }
  None
}

fn resolve_sidecar(resource_dir: &PathBuf) -> Result<PathBuf, String> {
  let exe_dir = env::current_exe()
    .ok()
    .and_then(|p| p.parent().map(|d| d.to_path_buf()));
  let mut candidates: Vec<PathBuf> = Vec::new();
  for base in std::iter::once(Some(resource_dir.clone())).chain(exe_dir.map(Some)) {
    if let Some(base) = base {
      for name in [
        "portalguard-server.exe",
        "portalguard-server-x86_64-pc-windows-msvc.exe",
        "portalguard-server-aarch64-pc-windows-msvc.exe",
      ] {
        candidates.push(base.join("binaries").join(name));
        candidates.push(base.join(name));
      }
    }
  }
  candidates
    .into_iter()
    .find(|p| p.exists())
    .ok_or_else(|| {
      format!(
        "sidecar portalguard-server.exe nao encontrado; tentativas: {}",
        [
          resource_dir.join("binaries").join("portalguard-server.exe"),
          resource_dir.join("portalguard-server.exe"),
        ]
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(", ")
      )
    })
}

fn spawn_server(app_handle: &tauri::AppHandle) -> anyhow::Result<(Child, u16, PathBuf)> {
  let data_dir = get_data_dir();
  let storage_dir = get_storage_dir(&data_dir);
  let _ = std::fs::create_dir_all(data_dir.join("data"));
  let _ = std::fs::create_dir_all(&storage_dir);
  let _ = std::fs::create_dir_all(storage_dir.join("resident-photos"));
  let _ = std::fs::create_dir_all(storage_dir.join("entry-photos"));
  let _ = std::fs::create_dir_all(storage_dir.join("access-photos"));
  let _ = std::fs::create_dir_all(storage_dir.join("mail-photos"));

  let port = get_port();

  let resource_dir = app_handle.path().resource_dir()?;
  let binary_path = resolve_sidecar(&resource_dir).map_err(|e| anyhow::anyhow!(e))?;

  let mut cmd = Command::new(&binary_path);
  cmd.env("PORTALGUARD_DATA_DIR", &data_dir)
    .env("PORTALGUARD_STORAGE_DIR", &storage_dir)
    .env("PORTALGUARD_PORT", port.to_string())
    .env("NODE_ENV", "production")
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  if let Some(web_dir) = get_web_dir(&resource_dir) {
    cmd.env("PORTALGUARD_WEB_DIR", &web_dir);
  }

  let mut child = cmd.spawn()?;
  let stdout = child.stdout.take().expect("failed to capture stdout");
  let stderr = child.stderr.take().expect("failed to capture stderr");
  let handle_clone = app_handle.clone();
  std::thread::spawn(move || {
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
      if let Ok(l) = line {
        let _ = handle_clone.emit("server-log", l);
      }
    }
  });
  let handle_clone = app_handle.clone();
  std::thread::spawn(move || {
    let mut reader = BufReader::new(stderr);
    let mut buf = String::new();
    let _ = reader.read_to_string(&mut buf);
    if !buf.is_empty() {
      let _ = handle_clone.emit("server-log", buf);
    }
  });
  std::thread::sleep(Duration::from_millis(500));
  Ok((child, port, data_dir))
}

#[tauri::command]
async fn start_server(app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
  {
    let mut server = state.server.lock().unwrap();
    if server.is_some() {
      return Ok(());
    }
  }
  match spawn_server(&app_handle) {
    Ok((child, port, data_dir)) => {
      *state.server.lock().unwrap() = Some(child);
      *state.server_port.lock().unwrap() = Some(port);
      *state.data_dir.lock().unwrap() = Some(data_dir);
      Ok(())
    }
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
async fn stop_server(state: State<'_, AppState>) -> Result<(), String> {
  let mut child_opt = state.server.lock().unwrap().take();
  if let Some(mut child) = child_opt.take() {
    let _ = child.kill();
    let _ = child.wait_timeout(Duration::from_secs(3));
  }
  *state.server_port.lock().unwrap() = None;
  *state.data_dir.lock().unwrap() = None;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(AppState {
      server: Mutex::new(None),
      server_port: Mutex::new(None),
      data_dir: Mutex::new(None),
    })
    .invoke_handler(tauri::generate_handler![start_server, stop_server, get_server_status])
    .setup(|app| {
      #[cfg(not(debug_assertions))]
      {
        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
          let state = app_handle.state::<AppState>();
          if let Err(e) = start_server(app_handle.clone(), state).await {
            let _ = app_handle.emit("server-log", format!("falha ao iniciar servidor: {e}"));
            return;
          }
          let port = {
            let p = app_handle.state::<AppState>();
            let value = *p.server_port.lock().unwrap();
            value
          };
          if let Some(port) = port {
            let handle = app_handle.clone();
            std::thread::spawn(move || {
              for _ in 0..200 {
                if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
                  if let Some(window) = handle.get_webview_window("main") {
                    if let Ok(u) = url::Url::parse(&format!("http://127.0.0.1:{port}/")) {
                      let _ = window.navigate(u);
                    }
                  }
                  break;
                }
                std::thread::sleep(Duration::from_millis(250));
              }
            });
          }
        });
      }
      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { .. } = event {
        let app_handle = window.app_handle().clone();
        tokio::spawn(async move {
          let state = app_handle.state::<AppState>();
          let _ = stop_server(state).await;
        });
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

mod startup;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[cfg(target_os = "macos")]
use tauri_plugin_autostart::MacosLauncher;

struct AppState {
  api_url: Mutex<Option<String>>,
  child: Mutex<Option<CommandChild>>,
}

#[tauri::command]
fn get_api_url(state: State<'_, AppState>) -> Option<String> {
  state.api_url.lock().unwrap().clone()
}

fn gui_root() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .expect("zk-gui root")
    .to_path_buf()
}

fn find_free_port() -> u16 {
  let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
  listener.local_addr().expect("local addr").port()
}

async fn wait_for_port(port: u16) -> Result<(), String> {
  for _ in 0..100 {
    if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
      return Ok(());
    }
    tokio::time::sleep(Duration::from_millis(100)).await;
  }
  Err(format!("Timed out waiting for sidecar on port {port}"))
}

async fn spawn_sidecar(
  app: &tauri::AppHandle,
  config_dir: &str,
  port: u16,
) -> Result<CommandChild, String> {
  let (mut rx, child) = if cfg!(debug_assertions) {
    let sidecar_path = gui_root().join("src").join("sidecar.ts");
    app
      .shell()
      .command("bun")
      .args(["run", sidecar_path.to_string_lossy().as_ref()])
      .current_dir(gui_root())
      .env("ZK_SIDECAR_PORT", port.to_string())
      .env("ZK_CONFIG_DIR", config_dir)
      .spawn()
      .map_err(|err| err.to_string())?
  } else {
    app
      .shell()
      .sidecar("zk-sidecar")
      .map_err(|err| err.to_string())?
      .env("ZK_SIDECAR_PORT", port.to_string())
      .env("ZK_CONFIG_DIR", config_dir)
      .spawn()
      .map_err(|err| err.to_string())?
  };

  tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
      if let CommandEvent::Stderr(line_bytes) = event {
        let line = String::from_utf8_lossy(&line_bytes);
        eprintln!("[zk-sidecar] {line}");
      }
    }
  });

  Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut autostart = tauri_plugin_autostart::Builder::new().args([startup::AUTOSTART_ARG]);
  #[cfg(target_os = "macos")]
  {
    autostart = autostart.macos_launcher(MacosLauncher::LaunchAgent);
  }

  tauri::Builder::default()
    .plugin(autostart.build())
    .plugin(tauri_plugin_shell::init())
    .manage(AppState {
      api_url: Mutex::new(None),
      child: Mutex::new(None),
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|err| err.to_string())?;
      std::fs::create_dir_all(&config_dir).map_err(|err| err.to_string())?;
      let config_dir = config_dir.to_string_lossy().to_string();

      let port = find_free_port();
      let api_url = format!("http://127.0.0.1:{port}");
      let app_handle = app.handle().clone();

      tauri::async_runtime::block_on(async move {
        let child = spawn_sidecar(&app_handle, &config_dir, port).await?;
        wait_for_port(port).await?;
        let state = app_handle.state::<AppState>();
        *state.api_url.lock().unwrap() = Some(api_url);
        *state.child.lock().unwrap() = Some(child);
        Ok::<(), String>(())
      })
      .map_err(|err| Box::<dyn std::error::Error>::from(err))?;

      startup::init(app.handle())?;

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_api_url,
      startup::get_startup_settings,
      startup::set_startup_settings,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if let tauri::RunEvent::Exit = event {
        if let Some(child) = app.state::<AppState>().child.lock().unwrap().take() {
          let _ = child.kill();
        }
      }
    });
}

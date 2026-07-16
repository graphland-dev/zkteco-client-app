use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;

pub const AUTOSTART_ARG: &str = "--from-autostart";

fn default_true() -> bool {
  true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupSettings {
  #[serde(default = "default_true")]
  pub launch_on_startup: bool,
  #[serde(default = "default_true")]
  pub start_in_tray: bool,
}

impl Default for StartupSettings {
  fn default() -> Self {
    Self {
      launch_on_startup: true,
      start_in_tray: true,
    }
  }
}

pub struct StartupState {
  settings: Mutex<StartupSettings>,
  settings_path: PathBuf,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
  app
    .path()
    .app_config_dir()
    .map(|dir| dir.join("startup-settings.json"))
    .map_err(|err| err.to_string())
}

fn read_settings(path: &PathBuf) -> StartupSettings {
  match fs::read_to_string(path) {
    Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
    Err(_) => StartupSettings::default(),
  }
}

fn write_settings(path: &PathBuf, settings: &StartupSettings) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
  }
  let body = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
  fs::write(path, body).map_err(|err| err.to_string())
}

pub fn launched_from_autostart() -> bool {
  std::env::args().any(|arg| arg == AUTOSTART_ARG)
}

fn apply_autostart(app: &AppHandle, settings: &StartupSettings) -> Result<(), String> {
  let autolaunch = app.autolaunch();
  if settings.launch_on_startup {
    autolaunch.enable().map_err(|err| err.to_string())?;
  } else {
    autolaunch.disable().map_err(|err| err.to_string())?;
  }
  Ok(())
}

fn show_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
}

fn setup_tray(app: &AppHandle) -> Result<(), String> {
  let show = MenuItem::with_id(app, "tray-show", "Show window", true, None::<&str>)
    .map_err(|err| err.to_string())?;
  let quit = MenuItem::with_id(app, "tray-quit", "Quit", true, None::<&str>)
    .map_err(|err| err.to_string())?;
  let menu = Menu::with_items(app, &[&show, &quit]).map_err(|err| err.to_string())?;

  let icon = app
    .default_window_icon()
    .ok_or_else(|| "Application icon is missing".to_string())?
    .clone();

  let app_handle = app.clone();
  TrayIconBuilder::new()
    .icon(icon)
    .menu(&menu)
    .tooltip("Graphland ZKT Client")
    .on_menu_event(move |app, event| {
      if event.id() == "tray-show" {
        show_main_window(app);
      } else if event.id() == "tray-quit" {
        app.exit(0);
      }
    })
    .on_tray_icon_event(move |_tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        show_main_window(&app_handle);
      }
    })
    .build(app)
    .map_err(|err| err.to_string())?;

  Ok(())
}

fn setup_window_close_to_tray(app: &AppHandle) -> Result<(), String> {
  let window = app
    .get_webview_window("main")
    .ok_or_else(|| "Main window not found".to_string())?;
  let window_for_close = window.clone();

  window.on_window_event(move |event| {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
      api.prevent_close();
      let _ = window_for_close.hide();
    }
  });

  Ok(())
}

pub fn init(app: &AppHandle) -> Result<(), String> {
  let path = settings_path(app)?;
  let settings = read_settings(&path);
  let is_first_run = !path.exists();

  if is_first_run {
    write_settings(&path, &settings)?;
  }

  app.manage(StartupState {
    settings: Mutex::new(settings.clone()),
    settings_path: path,
  });

  apply_autostart(app, &settings)?;
  setup_tray(app)?;
  setup_window_close_to_tray(app)?;

  if launched_from_autostart() && settings.start_in_tray {
    if let Some(window) = app.get_webview_window("main") {
      let _ = window.hide();
    }
  }

  Ok(())
}

#[tauri::command]
pub fn get_startup_settings(state: State<'_, StartupState>) -> StartupSettings {
  state.settings.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_startup_settings(
  app: AppHandle,
  state: State<'_, StartupState>,
  settings: StartupSettings,
) -> Result<StartupSettings, String> {
  write_settings(&state.settings_path, &settings)?;
  *state.settings.lock().unwrap() = settings.clone();
  apply_autostart(&app, &settings)?;
  Ok(settings)
}

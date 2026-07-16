import { invoke } from "@tauri-apps/api/core";

export interface StartupSettings {
  launchOnStartup: boolean;
  startInTray: boolean;
}

export async function getStartupSettings(): Promise<StartupSettings> {
  return invoke<StartupSettings>("get_startup_settings");
}

export async function saveStartupSettings(
  settings: StartupSettings,
): Promise<StartupSettings> {
  return invoke<StartupSettings>("set_startup_settings", { settings });
}

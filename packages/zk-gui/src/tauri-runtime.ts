import { isTauri } from "@tauri-apps/api/core";

export function isTauriRuntime(): boolean {
  return isTauri();
}

export const BROWSER_ONLY_MESSAGE =
  "This app must run inside the desktop window, not in a browser tab. Close this tab and use the Graphland ZKT Client window opened by `bun run dev`. On first launch, wait for Rust to finish compiling before the desktop window appears.";

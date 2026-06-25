import { invoke } from "@tauri-apps/api/core";
import type { ClientConfig, ConnectionStatus, SyncAttendanceResult, TestConnectionResult } from "./types";

let cachedBaseUrl: string | null = null;

async function resolveBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;

  for (let attempt = 0; attempt < 80; attempt++) {
    const url = await invoke<string | null>("get_api_url");
    if (url) {
      cachedBaseUrl = url;
      return url;
    }
    await new Promise((resolve) => setTimeout(resolve, 125));
  }

  throw new Error("Device service failed to start. Restart the application.");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = await resolveBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}

export async function loadConfig(): Promise<ClientConfig> {
  return request<ClientConfig>("/api/config");
}

export async function saveConfig(config: ClientConfig): Promise<ClientConfig> {
  return request<ClientConfig>("/api/config", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function getStatus(): Promise<ConnectionStatus> {
  return request<ConnectionStatus>("/api/status");
}

export async function connect(config: ClientConfig): Promise<ConnectionStatus> {
  return request<ConnectionStatus>("/api/connect", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function disconnect(): Promise<ConnectionStatus> {
  return request<ConnectionStatus>("/api/disconnect", { method: "POST" });
}

export async function refreshInfo(): Promise<ConnectionStatus> {
  return request<ConnectionStatus>("/api/refresh", { method: "POST" });
}

export async function testConnection(config: ClientConfig): Promise<TestConnectionResult> {
  return request<TestConnectionResult>("/api/test", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function syncAttendances(): Promise<SyncAttendanceResult> {
  return request<SyncAttendanceResult>("/api/sync-attendance", { method: "POST" });
}

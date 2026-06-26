import { invoke } from "@tauri-apps/api/core";
import type {
  ClientConfig,
  ConnectionStatus,
  DeviceUser,
  ImportUsersResult,
  PunchRecord,
  SyncAttendanceResult,
  TestConnectionResult,
  UserWriteInput,
} from "./types";

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

export async function listUsers(): Promise<DeviceUser[]> {
  return request<DeviceUser[]>("/api/users");
}

export async function createUser(input: UserWriteInput): Promise<DeviceUser> {
  return request<DeviceUser>("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateUser(
  userId: string,
  input: Omit<UserWriteInput, "userId">,
): Promise<DeviceUser> {
  return request<DeviceUser>("/api/users", {
    method: "PATCH",
    body: JSON.stringify({ userId, ...input }),
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await request<{ ok: boolean }>("/api/users", {
    method: "DELETE",
    body: JSON.stringify({ userId }),
  });
}

export async function importUsers(
  csv: string,
  updateExisting = false,
): Promise<ImportUsersResult> {
  return request<ImportUsersResult>("/api/users/import", {
    method: "POST",
    body: JSON.stringify({ csv, updateExisting }),
  });
}

export async function getUserPunchHistory(
  userId: string,
  options?: { from?: string; to?: string },
): Promise<PunchRecord[]> {
  const params = new URLSearchParams({ userId });
  if (options?.from) params.set("from", options.from);
  if (options?.to) params.set("to", options.to);
  return request<PunchRecord[]>(`/api/users/punches?${params.toString()}`);
}

export async function deleteUserPunch(input: {
  userId: string;
  recordTime: string;
  userSn?: number;
}): Promise<void> {
  await request<{ ok: boolean }>("/api/users/punches", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

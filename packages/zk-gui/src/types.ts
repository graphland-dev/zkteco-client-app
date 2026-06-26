import type { ConnectionType, DeviceInfo, UserRole, ZkClientOptions } from "@graphland/zk-client";

export type ClientConfig = Required<Pick<ZkClientOptions, "ip">> &
  Pick<ZkClientOptions, "port" | "timeout" | "udpPort" | "commKey" | "openDoorDelaySec"> & {
    webhookUrl?: string;
    webhookSecret?: string;
  };

export interface WebhookPassRecord {
  userId: string | number;
  attTime: string;
  delivered: boolean;
  deliveredAt?: string;
  error?: string;
}

export interface WebhookStatus {
  enabled: boolean;
  url: string | null;
  listening: boolean;
  passesForwarded: number;
  lastPassAt: string | null;
  lastDeliveredAt: string | null;
  lastError: string | null;
  recentPasses: WebhookPassRecord[];
}

export interface ConnectionStatus {
  connected: boolean;
  connectionType: ConnectionType | null;
  deviceInfo: DeviceInfo | null;
  lastError: string | null;
  config: ClientConfig | null;
  webhook: WebhookStatus;
  sync: SyncProgress;
}

export interface TestConnectionResult {
  ok: boolean;
  connectionType?: ConnectionType;
  deviceInfo?: DeviceInfo;
  error?: string;
  durationMs: number;
}

export interface WebhookAttendanceItem {
  userId: string | number;
  recordTime: string;
  punch?: number;
  punchLabel?: string;
  status?: number;
  statusLabel?: string;
  userSn?: number;
  deviceIp: string;
  source: "pass" | "sync";
  sentAt: string;
}

/** Webhook body is always a JSON array of attendance items. */
export type WebhookBody = WebhookAttendanceItem[];

export interface SyncProgress {
  inProgress: boolean;
  phase: "idle" | "downloading" | "uploading";
  total: number;
  processed: number;
  sent: number;
  failed: number;
  lastError: string | null;
}

export interface SyncAttendanceResult {
  ok: boolean;
  total: number;
  sent: number;
  failed: number;
  errors: string[];
  durationMs: number;
}

export interface DeviceUser {
  uid: number;
  role: number;
  name: string;
  password?: string;
  cardno?: number;
  userId: string;
  fingerprintCount?: number;
  fingerprintIndices?: number[];
}

export interface UserWriteInput {
  userId: string;
  name: string;
  password?: string;
  cardno?: number;
  role?: UserRole;
}

export interface PunchRecord {
  userSn?: number;
  deviceUserId: string | number;
  recordTime: string;
  punch?: number;
  punchLabel?: string;
  status?: number;
  statusLabel?: string;
}

export type { CsvUserRow, ImportUsersOptions, ImportUsersResult } from "./user-csv";

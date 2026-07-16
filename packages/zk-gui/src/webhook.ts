import { getVerifyModeLabel } from "@graphland/zkteco";
import type { AttendanceRecord, RealTimeLog } from "@graphland/zkteco";
import type { WebhookAttendanceItem, WebhookBody } from "./types.ts";

/** This app treats every device event as a punch; check-in/out is decided by the backend. */
const APP_PUNCH_LABEL = "punched";

export async function sendWebhookBatch(
  url: string,
  items: WebhookBody,
  options?: { secret?: string },
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Graphland-ZKT-Client/1.0",
  };
  const secret = normalizeWebhookSecret(options?.secret);
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(items),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      body ? `Webhook returned ${response.status}: ${body.slice(0, 200)}` : `Webhook returned ${response.status}`,
    );
  }
}

export function toWebhookItem(input: {
  userId: string | number;
  recordTime: Date;
  deviceIp: string;
  source: "pass" | "sync";
  punch?: number;
  status?: number;
  userSn?: number;
}): WebhookAttendanceItem {
  const sentAt = new Date().toISOString();
  const item: WebhookAttendanceItem = {
    userId: input.userId,
    recordTime: input.recordTime.toISOString(),
    deviceIp: input.deviceIp,
    source: input.source,
    sentAt,
  };

  if (input.punch !== undefined) {
    item.punch = input.punch;
    item.punchLabel = APP_PUNCH_LABEL;
  }
  if (input.status !== undefined) {
    item.status = input.status;
    item.statusLabel = getVerifyModeLabel(input.status);
  }
  if (input.userSn !== undefined) {
    item.userSn = input.userSn;
  }

  return item;
}

export function toPassWebhookItem(log: RealTimeLog, deviceIp: string): WebhookAttendanceItem {
  return toWebhookItem({
    userId: log.userId,
    recordTime: log.attTime,
    deviceIp,
    source: "pass",
    punch: log.punch,
    status: log.status,
  });
}

export function toAttendanceWebhookItem(
  record: AttendanceRecord,
  deviceIp: string,
): WebhookAttendanceItem {
  return toWebhookItem({
    userId: record.deviceUserId,
    recordTime: record.recordTime,
    deviceIp,
    source: "sync",
    punch: record.punch,
    status: record.status,
    userSn: record.userSn,
  });
}

export function normalizeWebhookUrl(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function normalizeWebhookSecret(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function isValidWebhookUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

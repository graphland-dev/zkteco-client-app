import { getPunchLabel, getVerifyModeLabel } from "@graphland/zk-client";
import type { AttendanceRecord, RealTimeLog } from "@graphland/zk-client";
import type { WebhookAttendanceItem, WebhookBody } from "./types.ts";

export async function sendWebhookBatch(url: string, items: WebhookBody): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Graphland-GKT-Client/1.0",
    },
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
    item.punchLabel = getPunchLabel(input.punch);
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

export function isValidWebhookUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

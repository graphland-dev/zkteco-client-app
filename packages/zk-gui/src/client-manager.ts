import { ZKTecoClient, ZkConnectionError, ZkError, summarizeFingerprintTemplates } from "@graphland/zkteco";
import type { AttendanceRecord, CreateUserInput, RealTimeLog, UpdateUserInput } from "@graphland/zkteco";
import type {
  ClientConfig,
  ConnectionStatus,
  PunchRecord,
  TestConnectionResult,
  SyncAttendanceResult,
  SyncProgress,
  UserWriteInput,
  WebhookPassRecord,
  WebhookStatus,
} from "./types.ts";
import {
  parseUsersCsv,
  toCreateUserInput,
  toUpdateUserInput,
  type ImportUsersOptions,
  type ImportUsersResult,
} from "./user-csv.ts";
import { isValidWebhookUrl, normalizeWebhookSecret, normalizeWebhookUrl, sendWebhookBatch, toAttendanceWebhookItem, toPassWebhookItem } from "./webhook.ts";

const MAX_RECENT_PASSES = 10;

function serializePunchRecord(record: AttendanceRecord): PunchRecord {
  return {
    userSn: record.userSn,
    deviceUserId: record.deviceUserId,
    recordTime: record.recordTime.toISOString(),
    punch: record.punch,
    punchLabel: record.punchLabel,
    status: record.status,
    statusLabel: record.statusLabel,
  };
}

function formatError(err: unknown): string {
  if (err instanceof ZkConnectionError) return err.message;
  if (err instanceof ZkError) return err.toast();
  if (err instanceof Error) return err.message;
  return String(err);
}

function toClientOptions(config: ClientConfig) {
  return {
    ip: config.ip.trim(),
    port: config.port ?? 4370,
    timeout: config.timeout ?? 10000,
    udpPort: config.udpPort ?? 4000,
    commKey: config.commKey ?? 0,
    openDoorDelaySec: config.openDoorDelaySec ?? 3,
  };
}

export class ClientManager {
  private client: ZKTecoClient | null = null;
  private activeConfig: ClientConfig | null = null;
  private deviceInfo: ConnectionStatus["deviceInfo"] = null;
  private lastError: string | null = null;
  private webhookUrl: string | null = null;
  private webhookSecret: string | null = null;
  private webhookListening = false;
  private webhookPassesForwarded = 0;
  private webhookLastPassAt: string | null = null;
  private webhookLastDeliveredAt: string | null = null;
  private webhookLastError: string | null = null;
  private recentPasses: WebhookPassRecord[] = [];
  private sync: SyncProgress = {
    inProgress: false,
    phase: "idle",
    total: 0,
    processed: 0,
    sent: 0,
    failed: 0,
    lastError: null,
  };

  private getSyncProgress(): SyncProgress {
    return { ...this.sync };
  }

  private getWebhookStatus(): WebhookStatus {
    return {
      enabled: Boolean(this.webhookUrl),
      url: this.webhookUrl,
      listening: this.webhookListening,
      passesForwarded: this.webhookPassesForwarded,
      lastPassAt: this.webhookLastPassAt,
      lastDeliveredAt: this.webhookLastDeliveredAt,
      lastError: this.webhookLastError,
      recentPasses: [...this.recentPasses],
    };
  }

  getStatus(): ConnectionStatus {
    return {
      connected: this.client?.isConnected ?? false,
      connectionType: this.client?.connectionType ?? null,
      deviceInfo: this.deviceInfo,
      lastError: this.lastError,
      config: this.activeConfig,
      webhook: this.getWebhookStatus(),
      sync: this.getSyncProgress(),
    };
  }

  private resetWebhookState(url: string | null = null): void {
    this.webhookUrl = url;
    this.webhookSecret = null;
    this.webhookListening = false;
    this.webhookPassesForwarded = 0;
    this.webhookLastPassAt = null;
    this.webhookLastDeliveredAt = null;
    this.webhookLastError = null;
    this.recentPasses = [];
  }

  private setWebhookFromConfig(config: ClientConfig): void {
    const url = normalizeWebhookUrl(config.webhookUrl);
    if (url && !isValidWebhookUrl(url)) {
      throw new Error("Webhook URL must be a valid http:// or https:// URL");
    }
    this.webhookUrl = url || null;
    const secret = normalizeWebhookSecret(config.webhookSecret);
    this.webhookSecret = secret || null;
  }

  private async startWebhookListener(): Promise<void> {
    if (!this.client?.isConnected || !this.webhookUrl) {
      this.webhookListening = false;
      return;
    }

    try {
      await this.client.getRealTimeLogs((log) => {
        void this.handlePass(log);
      });
      this.webhookListening = true;
      this.webhookLastError = null;
    } catch (err) {
      this.webhookListening = false;
      this.webhookLastError = formatError(err);
    }
  }

  private pushRecentPass(record: WebhookPassRecord): void {
    this.recentPasses = [record, ...this.recentPasses].slice(0, MAX_RECENT_PASSES);
  }

  clearWebhookLog(): ConnectionStatus {
    this.webhookPassesForwarded = 0;
    this.webhookLastPassAt = null;
    this.webhookLastDeliveredAt = null;
    this.webhookLastError = null;
    this.recentPasses = [];
    return this.getStatus();
  }

  private async handlePass(log: RealTimeLog): Promise<void> {
    const url = this.webhookUrl;
    const deviceIp = this.activeConfig?.ip;
    if (!url || !deviceIp) return;

    const attTime = log.attTime.toISOString();
    const passAt = new Date().toISOString();
    this.webhookLastPassAt = passAt;

    const item = toPassWebhookItem(log, deviceIp);

    try {
      await sendWebhookBatch(url, [item], { secret: this.webhookSecret ?? undefined });
      this.webhookLastDeliveredAt = new Date().toISOString();
      this.webhookLastError = null;
      this.webhookPassesForwarded += 1;
      this.pushRecentPass({
        userId: log.userId,
        attTime,
        delivered: true,
        deliveredAt: this.webhookLastDeliveredAt,
      });
    } catch (err) {
      const message = formatError(err);
      this.webhookLastError = message;
      this.pushRecentPass({
        userId: log.userId,
        attTime,
        delivered: false,
        error: message,
      });
    }
  }

  async applyConfig(config: ClientConfig): Promise<ConnectionStatus> {
    this.setWebhookFromConfig(config);
    this.activeConfig = config;

    if (this.client?.isConnected) {
      await this.startWebhookListener();
    }

    return this.getStatus();
  }

  async connect(config: ClientConfig): Promise<ConnectionStatus> {
    await this.disconnect();
    this.lastError = null;
    this.setWebhookFromConfig(config);

    const client = new ZKTecoClient(toClientOptions(config));
    try {
      await client.connect({
        onError: (error) => {
          this.lastError = error.message;
          this.webhookListening = false;
        },
        onClose: () => {
          this.deviceInfo = null;
          this.webhookListening = false;
        },
      });
      this.client = client;
      this.activeConfig = config;
      this.deviceInfo = await client.getInfo();
      await this.startWebhookListener();
      return this.getStatus();
    } catch (err) {
      this.lastError = formatError(err);
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
      throw new Error(this.lastError);
    }
  }

  async disconnect(): Promise<ConnectionStatus> {
    if (this.client?.isConnected) {
      try {
        await this.client.disconnect();
      } catch (err) {
        this.lastError = formatError(err);
      }
    }
    this.client = null;
    this.activeConfig = null;
    this.deviceInfo = null;
    this.resetWebhookState();
    return this.getStatus();
  }

  async refreshInfo(): Promise<ConnectionStatus> {
    if (!this.client?.isConnected) {
      throw new Error("Not connected to a device");
    }
    this.lastError = null;
    try {
      this.deviceInfo = await this.client.getInfo();
      return this.getStatus();
    } catch (err) {
      this.lastError = formatError(err);
      throw new Error(this.lastError);
    }
  }

  async resetDevice(): Promise<ConnectionStatus> {
    if (!this.client?.isConnected) {
      throw new Error("Not connected to a device");
    }
    this.lastError = null;
    try {
      await this.client.resetDevice();
      this.deviceInfo = await this.client.getInfo();
      this.clearWebhookLog();
      return this.getStatus();
    } catch (err) {
      this.lastError = formatError(err);
      throw new Error(this.lastError);
    }
  }

  async syncAttendances(): Promise<SyncAttendanceResult> {
    if (!this.client?.isConnected) {
      throw new Error("Not connected to a device");
    }
    if (!this.webhookUrl) {
      throw new Error("Webhook URL is not configured");
    }
    if (this.sync.inProgress) {
      throw new Error("Attendance sync is already in progress");
    }

    const url = this.webhookUrl;
    const deviceIp = this.activeConfig!.ip;
    const started = performance.now();
    const errors: string[] = [];

    this.sync = {
      inProgress: true,
      phase: "downloading",
      total: 0,
      processed: 0,
      sent: 0,
      failed: 0,
      lastError: null,
    };

    try {
      const records = await this.client.getAttendances((received, total) => {
        this.sync = {
          ...this.sync,
          phase: "downloading",
          total,
          processed: received,
        };
      });

      this.sync = {
        ...this.sync,
        phase: "uploading",
        total: records.length,
        processed: records.length,
      };

      const items = records.map((record) => toAttendanceWebhookItem(record, deviceIp));

      try {
        await sendWebhookBatch(url, items, { secret: this.webhookSecret ?? undefined });
        this.sync = {
          ...this.sync,
          sent: items.length,
          failed: 0,
          lastError: null,
        };
      } catch (err) {
        const message = formatError(err);
        errors.push(message);
        this.sync = {
          ...this.sync,
          sent: 0,
          failed: items.length,
          lastError: message,
        };
      }

      return {
        ok: this.sync.failed === 0,
        total: records.length,
        sent: this.sync.sent,
        failed: this.sync.failed,
        errors,
        durationMs: Math.round(performance.now() - started),
      };
    } catch (err) {
      const message = formatError(err);
      this.sync = { ...this.sync, lastError: message };
      throw new Error(message);
    } finally {
      this.sync = { ...this.sync, inProgress: false, phase: "idle" };
    }
  }

  private requireClient(): ZKTecoClient {
    if (!this.client?.isConnected) {
      throw new Error("Not connected to a device");
    }
    return this.client;
  }

  async listUsers() {
    const client = this.requireClient();
    const users = await client.getUsers();
    let fingerprintByUid = new Map<number, number[]>();

    try {
      const templates = await client.getFingerprintTemplates();
      fingerprintByUid = summarizeFingerprintTemplates(templates);
    } catch {
      // Some devices do not support bulk fingerprint template download.
    }

    return users.map((user) => ({
      uid: user.uid,
      role: user.role,
      name: user.name,
      password: user.password,
      cardno: user.cardno,
      userId: user.userId,
      fingerprintCount: fingerprintByUid.get(user.uid)?.length ?? 0,
      fingerprintIndices: fingerprintByUid.get(user.uid) ?? [],
    }));
  }

  async createUser(input: UserWriteInput) {
    const payload: CreateUserInput = {
      userId: input.userId.trim(),
      name: input.name.trim(),
      password: input.password,
      cardno: input.cardno,
      role: input.role,
    };
    if (!payload.userId || !payload.name) {
      throw new Error("User ID and name are required");
    }
    return this.requireClient().createUser(payload);
  }

  async updateUser(userId: string, input: Omit<UserWriteInput, "userId">) {
    const payload: UpdateUserInput = {
      name: input.name?.trim(),
      password: input.password,
      cardno: input.cardno,
      role: input.role,
    };
    return this.requireClient().updateUser(userId.trim(), payload);
  }

  async deleteUser(userId: string) {
    await this.requireClient().deleteUser(userId.trim());
  }

  async getUserPunchHistory(
    userId: string,
    options: { from?: string; to?: string } = {},
  ): Promise<PunchRecord[]> {
    const client = this.requireClient();
    const from = options.from ? new Date(options.from) : undefined;
    const to = options.to ? new Date(options.to) : undefined;
    const records = await client.getUserAttendances(userId.trim(), { from, to });
    return records
      .map(serializePunchRecord)
      .sort(
        (a, b) => new Date(b.recordTime).getTime() - new Date(a.recordTime).getTime(),
      );
  }

  async deleteUserPunch(input: {
    userId: string;
    recordTime: string;
    userSn?: number;
  }): Promise<void> {
    const client = this.requireClient();
    await client.deleteAttendanceRecord({
      userId: input.userId.trim(),
      recordTime: new Date(input.recordTime),
      userSn: input.userSn,
    });
  }

  async importUsers(options: ImportUsersOptions): Promise<ImportUsersResult> {
    const started = performance.now();
    const rows = parseUsersCsv(options.csv);
    if (rows.length === 0) {
      throw new Error("CSV has no valid user rows");
    }

    const client = this.requireClient();
    const existing = await client.getUsers();
    const existingIds = new Set(existing.map((user) => user.userId));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        if (existingIds.has(row.userId)) {
          if (options.updateExisting) {
            await client.updateUser(row.userId, toUpdateUserInput(row));
            updated++;
          } else {
            skipped++;
          }
          continue;
        }
        await client.createUser(toCreateUserInput(row));
        existingIds.add(row.userId);
        created++;
      } catch (err) {
        failed++;
        if (errors.length < 10) {
          errors.push(`${row.userId}: ${formatError(err)}`);
        }
      }
    }

    return {
      ok: failed === 0,
      total: rows.length,
      created,
      updated,
      skipped,
      failed,
      errors,
      durationMs: Math.round(performance.now() - started),
    };
  }

  async testConnection(config: ClientConfig): Promise<TestConnectionResult> {
    const url = normalizeWebhookUrl(config.webhookUrl);
    if (url && !isValidWebhookUrl(url)) {
      return {
        ok: false,
        error: "Webhook URL must be a valid http:// or https:// URL",
        durationMs: 0,
      };
    }

    const started = performance.now();
    const client = new ZKTecoClient(toClientOptions(config));

    try {
      await client.connect();
      const deviceInfo = await client.getInfo();
      const connectionType = client.connectionType!;
      await client.disconnect();
      return {
        ok: true,
        connectionType,
        deviceInfo,
        durationMs: Math.round(performance.now() - started),
      };
    } catch (err) {
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
      return {
        ok: false,
        error: formatError(err),
        durationMs: Math.round(performance.now() - started),
      };
    }
  }
}

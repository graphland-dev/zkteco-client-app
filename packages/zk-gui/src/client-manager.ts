import { ZkClient, ZkConnectionError, ZkError } from "@graphland/zk-client";
import type { RealTimeLog } from "@graphland/zk-client";
import type {
  ClientConfig,
  ConnectionStatus,
  TestConnectionResult,
  SyncAttendanceResult,
  SyncProgress,
  WebhookPassRecord,
  WebhookStatus,
} from "./types.ts";
import { isValidWebhookUrl, normalizeWebhookUrl, sendWebhookBatch, toAttendanceWebhookItem, toPassWebhookItem } from "./webhook.ts";

const MAX_RECENT_PASSES = 10;

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
  private client: ZkClient | null = null;
  private activeConfig: ClientConfig | null = null;
  private deviceInfo: ConnectionStatus["deviceInfo"] = null;
  private lastError: string | null = null;
  private webhookUrl: string | null = null;
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
    this.webhookListening = false;
    this.webhookPassesForwarded = 0;
    this.webhookLastPassAt = null;
    this.webhookLastDeliveredAt = null;
    this.webhookLastError = null;
    this.recentPasses = [];
  }

  private setWebhookUrlFromConfig(config: ClientConfig): void {
    const url = normalizeWebhookUrl(config.webhookUrl);
    if (url && !isValidWebhookUrl(url)) {
      throw new Error("Webhook URL must be a valid http:// or https:// URL");
    }
    this.webhookUrl = url || null;
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

  private async handlePass(log: RealTimeLog): Promise<void> {
    const url = this.webhookUrl;
    const deviceIp = this.activeConfig?.ip;
    if (!url || !deviceIp) return;

    const attTime = log.attTime.toISOString();
    const passAt = new Date().toISOString();
    this.webhookLastPassAt = passAt;

    const item = toPassWebhookItem(log, deviceIp);

    try {
      await sendWebhookBatch(url, [item]);
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
    this.setWebhookUrlFromConfig(config);
    this.activeConfig = config;

    if (this.client?.isConnected) {
      await this.startWebhookListener();
    }

    return this.getStatus();
  }

  async connect(config: ClientConfig): Promise<ConnectionStatus> {
    await this.disconnect();
    this.lastError = null;
    this.setWebhookUrlFromConfig(config);

    const client = new ZkClient(toClientOptions(config));
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
        await sendWebhookBatch(url, items);
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
    const client = new ZkClient(toClientOptions(config));

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

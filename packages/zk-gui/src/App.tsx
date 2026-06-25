import { useCallback, useEffect, useState } from "react";
import {
  connect,
  disconnect,
  getStatus,
  loadConfig,
  refreshInfo,
  saveConfig,
  syncAttendances,
  testConnection,
} from "./api";
import type { ClientConfig, ConnectionStatus, SyncAttendanceResult, TestConnectionResult } from "./types";
import "./styles.css";

const EMPTY_CONFIG: ClientConfig = {
  ip: "",
  port: 4370,
  timeout: 10000,
  udpPort: 4000,
  commKey: 0,
  openDoorDelaySec: 3,
  webhookUrl: "",
};

type BusyAction = "save" | "connect" | "disconnect" | "test" | "refresh" | "sync" | null;

function statusLabel(status: ConnectionStatus): string {
  if (status.connected) {
    return `Connected via ${status.connectionType?.toUpperCase() ?? "unknown"}`;
  }
  if (status.lastError) return "Connection failed";
  return "Disconnected";
}

function statusClass(status: ConnectionStatus): string {
  if (status.connected) return "status-pill connected";
  if (status.lastError) return "status-pill error";
  return "status-pill idle";
}

function DeviceInfoPanel({ info }: { info: NonNullable<ConnectionStatus["deviceInfo"]> }) {
  return (
    <section className="device-info-panel">
      <div className="panel-header">
        <h2>Device info</h2>
        <p>Returned from <code>getInfo()</code> after connect.</p>
      </div>
      <dl className="device-info-grid">
        <div>
          <dt>userCounts</dt>
          <dd>{info.userCounts}</dd>
        </div>
        <div>
          <dt>logCounts</dt>
          <dd>{info.logCounts}</dd>
        </div>
        <div>
          <dt>logCapacity</dt>
          <dd>{info.logCapacity}</dd>
        </div>
      </dl>
    </section>
  );
}

export function App() {
  const [config, setConfig] = useState<ClientConfig>(EMPTY_CONFIG);
  const [status, setStatus] = useState<ConnectionStatus>({
    connected: false,
    connectionType: null,
    deviceInfo: null,
    lastError: null,
    config: null,
    webhook: {
      enabled: false,
      url: null,
      listening: false,
      passesForwarded: 0,
      lastPassAt: null,
      lastDeliveredAt: null,
      lastError: null,
      recentPasses: [],
    },
    sync: {
      inProgress: false,
      phase: "idle",
      total: 0,
      processed: 0,
      sent: 0,
      failed: 0,
      lastError: null,
    },
  });
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncAttendanceResult | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refreshStatus = useCallback(async () => {
    const next = await getStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [savedConfig, currentStatus] = await Promise.all([loadConfig(), getStatus()]);
        if (cancelled) return;
        setConfig(savedConfig);
        setStatus(currentStatus);
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!status.connected && !status.sync.inProgress) return;

    const interval = window.setInterval(() => {
      refreshStatus().catch(() => undefined);
    }, status.sync.inProgress ? 500 : 2000);

    return () => window.clearInterval(interval);
  }, [status.connected, status.sync.inProgress, refreshStatus]);

  function updateField<K extends keyof ClientConfig>(key: K, value: ClientConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  async function runAction(action: BusyAction, fn: () => Promise<void>) {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (!ready) {
    return (
      <div className="app-shell">
        <div className="loading-card">
          <div className="spinner" />
          <p>Starting device service…</p>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Graphland</p>
          <h1>GKT Client</h1>
          <p className="subtitle">Configure your device and verify connectivity.</p>
        </div>
        <div className={statusClass(status)}>
          <span className="status-dot" />
          {statusLabel(status)}
        </div>
      </header>

      {status.deviceInfo ? <DeviceInfoPanel info={status.deviceInfo} /> : null}

      <main className="layout">
        <section className="panel">
          <div className="panel-header">
            <h2>Device configuration</h2>
            <p>Settings are saved to your app data folder.</p>
          </div>

          <form
            className="config-form"
            onSubmit={(event) => {
              event.preventDefault();
              runAction("save", async () => {
                const saved = await saveConfig(config);
                setConfig(saved);
                setMessage("Configuration saved.");
              });
            }}
          >
            <label>
              <span>Device IP</span>
              <input
                required
                value={config.ip}
                onChange={(event) => updateField("ip", event.target.value)}
                placeholder="192.168.0.153"
              />
            </label>

            <div className="field-grid">
              <label>
                <span>TCP port</span>
                <input
                  type="number"
                  value={config.port ?? 4370}
                  onChange={(event) => updateField("port", Number(event.target.value))}
                />
              </label>
              <label>
                <span>Timeout (ms)</span>
                <input
                  type="number"
                  value={config.timeout ?? 10000}
                  onChange={(event) => updateField("timeout", Number(event.target.value))}
                />
              </label>
              <label>
                <span>UDP port</span>
                <input
                  type="number"
                  value={config.udpPort ?? 4000}
                  onChange={(event) => updateField("udpPort", Number(event.target.value))}
                />
              </label>
              <label>
                <span>CommKey</span>
                <input
                  type="number"
                  value={config.commKey ?? 0}
                  onChange={(event) => updateField("commKey", Number(event.target.value))}
                />
              </label>
            </div>

            <label>
              <span>Door unlock duration (seconds)</span>
              <input
                type="number"
                value={config.openDoorDelaySec ?? 3}
                onChange={(event) => updateField("openDoorDelaySec", Number(event.target.value))}
              />
            </label>

            <label>
              <span>Webhook URL</span>
              <input
                type="url"
                value={config.webhookUrl ?? ""}
                onChange={(event) => updateField("webhookUrl", event.target.value)}
                placeholder="https://api.example.com/attendance/pass"
              />
            </label>
            <p className="field-hint">
              Live passes and manual sync both POST a JSON array of attendance records to this URL.
            </p>

            <div className="button-row">
              <button type="submit" className="secondary" disabled={busy !== null}>
                {busy === "save" ? "Saving…" : "Save configuration"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy !== null}
                onClick={() =>
                  runAction("test", async () => {
                    const result = await testConnection(config);
                    setTestResult(result);
                    if (result.ok) {
                      setMessage(
                        `Test succeeded over ${result.connectionType?.toUpperCase()} in ${result.durationMs} ms.`,
                      );
                    } else {
                      setError(result.error ?? "Connection test failed.");
                    }
                  })
                }
              >
                {busy === "test" ? "Testing…" : "Test connection"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Connection status</h2>
            <p>Keep a live session open or run a one-off test.</p>
          </div>

          <div className="status-card">
            <dl>
              <div>
                <dt>State</dt>
                <dd>{status.connected ? "Connected" : "Not connected"}</dd>
              </div>
              <div>
                <dt>Transport</dt>
                <dd>{status.connectionType?.toUpperCase() ?? "—"}</dd>
              </div>
              <div>
                <dt>Device IP</dt>
                <dd>{status.config?.ip ?? config.ip}</dd>
              </div>
              <div>
                <dt>Webhook</dt>
                <dd>
                  {!status.webhook.enabled
                    ? "Not configured"
                    : status.webhook.listening
                      ? "Listening"
                      : "Configured"}
                </dd>
              </div>
              <div>
                <dt>Passes sent</dt>
                <dd>{status.webhook.passesForwarded}</dd>
              </div>
            </dl>
          </div>

          {status.webhook.enabled ? (
            <div className="webhook-panel">
              <p className="webhook-url">{status.webhook.url}</p>
              {status.webhook.lastError ? (
                <p className="error-text">Webhook error: {status.webhook.lastError}</p>
              ) : null}
              {status.webhook.recentPasses.length > 0 ? (
                <ul className="pass-list">
                  {status.webhook.recentPasses.map((pass, index) => (
                    <li key={`${pass.attTime}-${pass.userId}-${index}`} className={pass.delivered ? "ok" : "fail"}>
                      <span className="pass-user">{String(pass.userId)}</span>
                      <span className="pass-time">{new Date(pass.attTime).toLocaleString()}</span>
                      <span className="pass-state">{pass.delivered ? "Sent" : "Failed"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="field-hint">Waiting for the next pass on the device…</p>
              )}
            </div>
          ) : null}

          {status.lastError ? <p className="error-text">{status.lastError}</p> : null}
          {message ? <p className="success-text">{message}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}

          {testResult ? (
            <div className={`test-result ${testResult.ok ? "ok" : "fail"}`}>
              <strong>{testResult.ok ? "Last test passed" : "Last test failed"}</strong>
              <span>
                {testResult.ok
                  ? `${testResult.connectionType?.toUpperCase()} · ${testResult.durationMs} ms`
                  : (testResult.error ?? "Unknown error")}
              </span>
              {testResult.ok && testResult.deviceInfo ? (
                <dl className="device-info-inline">
                  <div>
                    <dt>userCounts</dt>
                    <dd>{testResult.deviceInfo.userCounts}</dd>
                  </div>
                  <div>
                    <dt>logCounts</dt>
                    <dd>{testResult.deviceInfo.logCounts}</dd>
                  </div>
                  <div>
                    <dt>logCapacity</dt>
                    <dd>{testResult.deviceInfo.logCapacity}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          ) : null}

          {status.sync.inProgress ? (
            <div className="sync-progress">
              <strong>
                {status.sync.phase === "downloading"
                  ? "Downloading attendance from device…"
                  : "Sending attendance to webhook…"}
              </strong>
              <span>
                {status.sync.processed}
                {status.sync.total > 0 ? ` / ${status.sync.total}` : ""}
                {status.sync.phase === "uploading"
                  ? ` · sent ${status.sync.sent}, failed ${status.sync.failed}`
                  : ""}
              </span>
            </div>
          ) : null}

          {syncResult ? (
            <div className={`test-result ${syncResult.ok ? "ok" : "fail"}`}>
              <strong>{syncResult.ok ? "Sync completed" : "Sync completed with errors"}</strong>
              <span>
                {syncResult.sent} sent, {syncResult.failed} failed of {syncResult.total} ·{" "}
                {syncResult.durationMs} ms
              </span>
            </div>
          ) : null}

          <div className="button-row">
            {status.connected ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy !== null}
                  onClick={() =>
                    runAction("refresh", async () => {
                      const next = await refreshInfo();
                      setStatus(next);
                      setMessage("Device info refreshed.");
                    })
                  }
                >
                  {busy === "refresh" ? "Refreshing…" : "Refresh info"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy !== null || !status.webhook.enabled}
                  onClick={() =>
                    runAction("sync", async () => {
                      setSyncResult(null);
                      const result = await syncAttendances();
                      setSyncResult(result);
                      const next = await refreshStatus();
                      setStatus(next);
                      if (result.ok) {
                        setMessage(`Synced ${result.sent} attendance records to webhook.`);
                      } else {
                        setError(
                          `Synced with errors: ${result.sent} sent, ${result.failed} failed.`,
                        );
                      }
                    })
                  }
                >
                  {busy === "sync" ? "Syncing…" : "Sync attendance"}
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy !== null}
                  onClick={() =>
                    runAction("disconnect", async () => {
                      const next = await disconnect();
                      setStatus(next);
                      setMessage("Disconnected from device.");
                    })
                  }
                >
                  {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="primary"
                disabled={busy !== null || !config.ip.trim()}
                onClick={() =>
                  runAction("connect", async () => {
                    const next = await connect(config);
                    setStatus(next);
                    if (next.deviceInfo) {
                      const { userCounts, logCounts, logCapacity } = next.deviceInfo;
                      setMessage(
                        `Connected — userCounts: ${userCounts}, logCounts: ${logCounts}, logCapacity: ${logCapacity}`,
                      );
                    } else {
                      setMessage("Connected to device.");
                    }
                  })
                }
              >
                {busy === "connect" ? "Connecting…" : "Connect"}
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

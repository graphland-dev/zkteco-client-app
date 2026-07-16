import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  getStartupSettings,
  saveStartupSettings,
  type StartupSettings,
} from "@/startup-settings";
import { DEMO_MODE_ENABLED } from "@/demo/config";
import {
  clearDemoData,
  ensureDemoSeed,
  loadAttendanceLog,
  simulateAttendancePunch,
} from "@/demo/seed";
import { Button } from "@/components/ui/button";
import { isTauriRuntime } from "@/tauri-runtime";

const DEFAULT_STARTUP_SETTINGS: StartupSettings = {
  launchOnStartup: true,
  startInTray: true,
};

type SaveState = "idle" | "saving" | "saved" | "error";

function notifyAttendanceUpdated() {
  window.dispatchEvent(new Event("gl-zkt-attendance-updated"));
}

export function SettingsPage() {
  const [settings, setSettings] = useState<StartupSettings>(DEFAULT_STARTUP_SETTINGS);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);
  const [passCount, setPassCount] = useState(0);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getStartupSettings()
      .then((loaded) => {
        if (!cancelled) {
          setSettings(loaded);
          setReady(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    getVersion()
      .then((version) => {
        if (!cancelled) setAppVersion(version);
      })
      .catch(() => {
        if (!cancelled) setAppVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Seed demo data into localStorage only when Settings is opened (and demo mode is on).
  useEffect(() => {
    if (!ready || !DEMO_MODE_ENABLED) return;
    const wrote = ensureDemoSeed();
    setPassCount(loadAttendanceLog().length);
    if (wrote) {
      setDemoMessage("Demo seed written to localStorage (users + previous punches from all machines).");
      notifyAttendanceUpdated();
    }
  }, [ready]);

  async function updateSetting<K extends keyof StartupSettings>(
    key: K,
    value: StartupSettings[K],
  ) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    setSaveState("saving");
    setError(null);

    try {
      const saved = await saveStartupSettings(next);
      setSettings(saved);
      setSaveState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaveState("error");
    }
  }

  function handleSimulate() {
    ensureDemoSeed();
    const pass = simulateAttendancePunch();
    setPassCount(loadAttendanceLog().length);
    setDemoMessage(
      `Simulated punch: ${pass.userName ?? pass.userId} @ ${pass.deviceIp} (${new Date(pass.attTime).toLocaleTimeString()})`,
    );
    notifyAttendanceUpdated();
  }

  function handleClearDemo() {
    clearDemoData();
    setPassCount(0);
    setDemoMessage("Demo seed and attendance log cleared from localStorage.");
    notifyAttendanceUpdated();
  }

  if (!ready) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>Startup settings</h2>
          <p>Loading preferences…</p>
        </div>
      </section>
    );
  }

  return (
    <main className="layout settings-layout">
      <section className="panel">
        <div className="panel-header">
          <h2>Startup settings</h2>
          <p>Control how the app behaves when your computer starts.</p>
        </div>

        <div className="settings-list">
          <label className="settings-toggle">
            <div>
              <span className="settings-toggle-label">Launch at login</span>
              <p className="field-hint">
                Start Graphland ZKT Client automatically when you sign in to your computer.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.launchOnStartup}
              disabled={saveState === "saving"}
              onChange={(event) => updateSetting("launchOnStartup", event.target.checked)}
            />
          </label>

          <label className={`settings-toggle ${!settings.launchOnStartup ? "disabled" : ""}`}>
            <div>
              <span className="settings-toggle-label">Start in system tray</span>
              <p className="field-hint">
                When launched at login, keep the window hidden and run from the tray icon. Click
                the tray icon to open the window.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.startInTray}
              disabled={saveState === "saving" || !settings.launchOnStartup}
              onChange={(event) => updateSetting("startInTray", event.target.checked)}
            />
          </label>
        </div>

        <p className="field-hint">
          Closing the window keeps the app running in the tray. Choose <strong>Quit</strong> from
          the tray menu to fully exit. The app also auto-connects to the saved device IP on startup.
        </p>

        {saveState === "saved" ? <p className="success-text">Startup settings saved.</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      {DEMO_MODE_ENABLED ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Demo / seed data</h2>
            <p>
              Seed data is written to localStorage when you open Settings. Turn off via{" "}
              <code>DEMO_MODE_ENABLED</code> in <code>src/demo/config.ts</code>.
            </p>
          </div>

          <p className="field-hint">
            Stored punches: <strong>{passCount}</strong>
          </p>

          <div className="button-row">
            <Button type="button" onClick={handleSimulate}>
              Simulate attendance
            </Button>
            <Button type="button" variant="outline" onClick={handleClearDemo}>
              Clear demo data
            </Button>
          </div>

          {demoMessage ? <p className="success-text">{demoMessage}</p> : null}
        </section>
      ) : null}

      {appVersion ? (
        <p className="settings-version" aria-label="App version">
          Version {appVersion}
        </p>
      ) : null}
    </main>
  );
}

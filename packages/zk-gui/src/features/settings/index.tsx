import { useEffect, useState } from "react";
import {
  getStartupSettings,
  saveStartupSettings,
  type StartupSettings,
} from "@/startup-settings";

const DEFAULT_STARTUP_SETTINGS: StartupSettings = {
  launchOnStartup: true,
  startInTray: true,
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function SettingsPage() {
  const [settings, setSettings] = useState<StartupSettings>(DEFAULT_STARTUP_SETTINGS);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

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
          the tray menu to fully exit.
        </p>

        {saveState === "saved" ? <p className="success-text">Startup settings saved.</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}

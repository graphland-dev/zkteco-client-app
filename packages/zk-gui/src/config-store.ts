import { join } from "node:path";
import { homedir } from "node:os";
import type { ClientConfig } from "./types.ts";

function configDir(): string {
  return process.env.ZK_CONFIG_DIR ?? join(homedir(), ".graphland-gkt-client");
}

function configPath(): string {
  return join(configDir(), "config.json");
}

export const DEFAULT_CONFIG: ClientConfig = {
  ip: "192.168.0.153",
  port: 4370,
  timeout: 10000,
  udpPort: 4000,
  commKey: 0,
  openDoorDelaySec: 3,
  webhookUrl: "",
};

export async function loadConfig(): Promise<ClientConfig> {
  try {
    const file = Bun.file(configPath());
    if (!(await file.exists())) return { ...DEFAULT_CONFIG };
    const parsed = (await file.json()) as Partial<ClientConfig>;
    return { ...DEFAULT_CONFIG, ...parsed, ip: parsed.ip ?? DEFAULT_CONFIG.ip };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: ClientConfig): Promise<void> {
  const dir = configDir();
  await Bun.write(join(dir, ".keep"), "");
  await Bun.write(configPath(), JSON.stringify(config, null, 2));
}

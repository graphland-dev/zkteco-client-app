import { ClientManager } from "./client-manager.ts";
import { hasSavedConfig, loadConfig, saveConfig } from "./config-store.ts";
import type { ClientConfig } from "./types.ts";
import { isValidWebhookUrl, normalizeWebhookUrl } from "./webhook.ts";

const manager = new ClientManager();
const hostname = "127.0.0.1";
const port = Number(process.env.ZK_SIDECAR_PORT ?? 0);

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(data: unknown, status = 200): Response {
  return withCors(Response.json(data, { status }));
}

async function readConfig(req: Request): Promise<ClientConfig> {
  const body = (await req.json()) as Partial<ClientConfig>;
  if (!body.ip?.trim()) {
    throw new Error("Device IP is required");
  }
  const webhookUrl = normalizeWebhookUrl(body.webhookUrl);
  if (webhookUrl && !isValidWebhookUrl(webhookUrl)) {
    throw new Error("Webhook URL must be a valid http:// or https:// URL");
  }
  return {
    ip: body.ip.trim(),
    port: Number(body.port ?? 4370),
    timeout: Number(body.timeout ?? 10000),
    udpPort: Number(body.udpPort ?? 4000),
    commKey: Number(body.commKey ?? 0),
    openDoorDelaySec: Number(body.openDoorDelaySec ?? 3),
    webhookUrl,
    webhookSecret: body.webhookSecret?.trim() ?? "",
  };
}

type RouteHandler = (req: Request) => Response | Promise<Response>;

const routes: Record<string, Partial<Record<string, RouteHandler>>> = {
  "/api/health": {
    GET: () => json({ ok: true }),
  },
  "/api/config": {
    GET: async () => json(await loadConfig()),
    POST: async (req) => {
      try {
        const config = await readConfig(req);
        await saveConfig(config);
        if (manager.getStatus().connected) {
          await manager.applyConfig(config);
        }
        return json(config);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    },
  },
  "/api/status": {
    GET: () => json(manager.getStatus()),
  },
  "/api/connect": {
    POST: async (req) => {
      try {
        const config = await readConfig(req);
        await saveConfig(config);
        const status = await manager.connect(config);
        return json(status);
      } catch (err) {
        return json(
          {
            ...manager.getStatus(),
            error: err instanceof Error ? err.message : String(err),
          },
          400,
        );
      }
    },
  },
  "/api/disconnect": {
    POST: async () => json(await manager.disconnect()),
  },
  "/api/refresh": {
    POST: async () => {
      try {
        return json(await manager.refreshInfo());
      } catch (err) {
        return json(
          {
            ...manager.getStatus(),
            error: err instanceof Error ? err.message : String(err),
          },
          400,
        );
      }
    },
  },
  "/api/device/reset": {
    POST: async () => {
      try {
        return json(await manager.resetDevice());
      } catch (err) {
        return json(
          {
            ...manager.getStatus(),
            error: err instanceof Error ? err.message : String(err),
          },
          400,
        );
      }
    },
  },
  "/api/test": {
    POST: async (req) => {
      try {
        const config = await readConfig(req);
        return json(await manager.testConnection(config));
      } catch (err) {
        return json(
          {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            durationMs: 0,
          },
          400,
        );
      }
    },
  },
  "/api/sync-attendance": {
    POST: async () => {
      try {
        return json(await manager.syncAttendances());
      } catch (err) {
        return json(
          {
            ok: false,
            total: 0,
            sent: 0,
            failed: 0,
            errors: [err instanceof Error ? err.message : String(err)],
            durationMs: 0,
          },
          400,
        );
      }
    },
  },
  "/api/webhook/clear-log": {
    POST: async () => json(manager.clearWebhookLog()),
  },
  "/api/users": {
    GET: async () => {
      try {
        return json(await manager.listUsers());
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    },
    POST: async (req) => {
      try {
        const body = (await req.json()) as Parameters<typeof manager.createUser>[0];
        return json(await manager.createUser(body));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    },
    PATCH: async (req) => {
      try {
        const body = (await req.json()) as { userId: string } & Omit<
          Parameters<typeof manager.updateUser>[1],
          never
        >;
        const { userId, ...input } = body;
        if (!userId?.trim()) throw new Error("User ID is required");
        return json(await manager.updateUser(userId, input));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    },
    DELETE: async (req) => {
      try {
        const body = (await req.json()) as { userId: string };
        if (!body.userId?.trim()) throw new Error("User ID is required");
        await manager.deleteUser(body.userId);
        return json({ ok: true });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    },
  },
  "/api/users/import": {
    POST: async (req) => {
      try {
        const body = (await req.json()) as { csv: string; updateExisting?: boolean };
        return json(await manager.importUsers(body));
      } catch (err) {
        return json(
          {
            ok: false,
            total: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [err instanceof Error ? err.message : String(err)],
            durationMs: 0,
          },
          400,
        );
      }
    },
  },
  "/api/users/punches": {
    GET: async (req) => {
      try {
        const url = new URL(req.url);
        const userId = url.searchParams.get("userId");
        if (!userId?.trim()) throw new Error("User ID is required");
        const from = url.searchParams.get("from") ?? undefined;
        const to = url.searchParams.get("to") ?? undefined;
        return json(await manager.getUserPunchHistory(userId, { from, to }));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    },
    DELETE: async (req) => {
      try {
        const body = (await req.json()) as {
          userId: string;
          recordTime: string;
          userSn?: number;
        };
        if (!body.userId?.trim()) throw new Error("User ID is required");
        if (!body.recordTime?.trim()) throw new Error("Record time is required");
        await manager.deleteUserPunch(body);
        return json({ ok: true });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    },
  },
};

/** Auto-connect to the saved device when the app (and sidecar) start. */
async function autoConnectOnStartup(): Promise<void> {
  try {
    if (!(await hasSavedConfig())) {
      console.log("ZK_AUTO_CONNECT_SKIPPED=no-saved-config");
      return;
    }
    const config = await loadConfig();
    if (!config.ip?.trim()) {
      console.log("ZK_AUTO_CONNECT_SKIPPED=no-ip");
      return;
    }
    await manager.connect(config);
    console.log(`ZK_AUTO_CONNECTED=${config.ip}`);

    if (manager.getStatus().webhook.enabled) {
      try {
        const result = await manager.syncAttendances();
        console.log(
          `ZK_AUTO_SYNC_ATTENDANCE=ok total=${result.total} sent=${result.sent} failed=${result.failed}`,
        );
      } catch (err) {
        console.error(
          `ZK_AUTO_SYNC_ATTENDANCE_FAILED=${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      console.log("ZK_AUTO_SYNC_ATTENDANCE_SKIPPED=no-webhook");
    }
  } catch (err) {
    console.error(
      `ZK_AUTO_CONNECT_FAILED=${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

void autoConnectOnStartup();

const server = Bun.serve({
  hostname,
  port,
  async fetch(req) {
    const { pathname } = new URL(req.url);

    if (req.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    const route = routes[pathname];
    if (!route) {
      return json({ error: "Not found" }, 404);
    }

    const handler = route[req.method];
    if (!handler) {
      return json({ error: "Method not allowed" }, 405);
    }

    return handler(req);
  },
});

console.log(`ZK_SIDECAR_READY=http://${hostname}:${server.port}`);

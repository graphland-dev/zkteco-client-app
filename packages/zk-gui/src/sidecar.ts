import { ClientManager } from "./client-manager.ts";
import { loadConfig, saveConfig } from "./config-store.ts";
import type { ClientConfig } from "./types.ts";
import { isValidWebhookUrl, normalizeWebhookUrl } from "./webhook.ts";

const manager = new ClientManager();
const hostname = "127.0.0.1";
const port = Number(process.env.ZK_SIDECAR_PORT ?? 0);

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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
};

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

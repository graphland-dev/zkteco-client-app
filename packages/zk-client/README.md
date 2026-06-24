# @graphland/zk-client

TypeScript client for ZKTeco biometric attendance devices. Connects over TCP (with UDP fallback), supports CommKey authentication, and provides a high-level API for users, attendance, and device management.

Built with [Bun](https://bun.sh) — no runtime dependencies.

## Installation

This package lives in a Bun workspace. From the monorepo root:

```bash
bun install
```

Or add as a workspace dependency:

```json
{
  "dependencies": {
    "@graphland/zk-client": "workspace:*"
  }
}
```

## Quick start

```typescript
import { ZkClient } from "@graphland/zk-client";

const zk = new ZkClient({
  ip: "192.168.0.153",
  port: 6523,        // device TCP port (default: 4370)
  timeout: 10000,
  commKey: 0,        // device CommKey password (default: 0)
});

await zk.connect();

const info = await zk.getInfo();
console.log(info); // { userCounts, logCounts, logCapacity }

await zk.disconnect();
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `ip` | — | Device IP address (required) |
| `port` | `4370` | TCP port |
| `timeout` | `10000` | Socket timeout in ms |
| `udpPort` | `4000` | Local UDP bind port (fallback) |
| `commKey` | `0` | Communication key set on the device |
| `openDoorDelaySec` | `3` | Door unlock duration |

### Connection

- Tries **TCP** first, falls back to **UDP** if TCP is refused.
- Handles **CommKey auth**: `CMD_ACK_UNAUTH` → `CMD_AUTH` handshake (same as pyzk).
- Validates the device after connect via `getInfo()`.

```typescript
await zk.connect({
  onError: (err) => console.error(err),
  onClose: (type) => console.log(`Disconnected (${type})`),
});
```

## Users

```typescript
// List all users
const users = await zk.getUsers();

// Find by id (throws ZkNotFoundError if missing)
const user = await zk.getUserById("5011");

// Search
const results = await zk.searchUsers("rayhan");
const exact = await zk.searchUsers({ userId: "5011", match: "exact" });
const first = await zk.searchUser({ name: "Ray" }); // null if not found

// Create / update / delete
await zk.createUser({ userId: "99", name: "Jane", password: "1234" });
await zk.updateUser("99", { name: "Jane Updated" });
await zk.deleteUser("99"); // or deleteUser(uid)
```

## Attendance

The device returns **all** attendance logs in one download. Per-user methods filter client-side.

```typescript
// All records
const all = await zk.getAttendances();

// One user
const records = await zk.getUserAttendances("5011");

// With date range
const june = await zk.getUserAttendances("5011", {
  from: new Date("2026-06-01"),
  to: new Date("2026-06-30"),
});

// Real-time punches
await zk.getRealTimeLogs(({ userId, attTime }) => {
  console.log(userId, attTime);
});
```

### Check-in / check-out

Each record includes `punch` and `punchLabel`:

```typescript
{
  userSn: 6850,
  deviceUserId: "5011",
  recordTime: Date,
  punch: 1,              // 0=out, 1=in, 2=break-out, 3=break-in
  punchLabel: "check-in",
  status: 1,             // verify mode: fingerprint, card, face, …
  statusLabel: "fingerprint",
}
```

```typescript
import { isCheckIn, isCheckOut, getPunchLabel } from "@graphland/zk-client";

records.filter((r) => isCheckIn(r.punch!));
records.filter((r) => isCheckOut(r.punch!));
```

> **Note:** Punch values depend on device function-key configuration. If the device doesn't use in/out keys, `punch` may always be `0`.

| `punch` | Default label |
|---------|---------------|
| `0` | check-out |
| `1` | check-in |
| `2` | break-out |
| `3` | break-in |
| `4` | overtime-in |
| `5` | overtime-out |

## Device operations

```typescript
await zk.getTime();
await zk.setTime(new Date());
await zk.openDoor(5);           // unlock door for 5 seconds
await zk.disableDevice();
await zk.enableDevice();
await zk.refreshData();
await zk.clearAttendanceLog();
```

## Error handling

```typescript
import { ZkError, ZkNotFoundError, ZkConnectionError } from "@graphland/zk-client";

try {
  await zk.connect();
  await zk.getUserById("missing");
} catch (err) {
  if (err instanceof ZkConnectionError) {
  // Wrong port, CommKey, or unreachable device
    console.error(err.message, err.port);
  } else if (err instanceof ZkNotFoundError) {
    console.error(`${err.resource} ${err.id} not found`);
  } else if (err instanceof ZkError) {
    console.error(err.toast());
  }
}
```

| Error | When |
|-------|------|
| `ZkConnectionError` | Connect fails (wrong port, CommKey, timeout) |
| `ZkNotFoundError` | `getUserById`, `updateUser`, `deleteUser` — user missing |
| `ZkError` | Any other device/command failure |

## Low-level API

```typescript
import { COMMANDS } from "@graphland/zk-client";

const raw = await zk.executeCmd(COMMANDS.CMD_GET_VERSION, "");
```

## Testing

Unit tests cover protocol encoding/decoding, auth, search helpers, and error types. No hardware required.

```bash
# From package directory
bun test

# From monorepo root
bun run --filter @graphland/zk-client test
```

```bash
bun run typecheck
```

## Project structure

```
packages/zk-client/
├── src/
│   ├── client.ts          # ZkClient — main API
│   ├── transport/         # TCP & UDP transports
│   ├── protocol.ts        # Packet encode/decode
│   ├── auth.ts            # CommKey handshake
│   ├── attendance.ts      # Punch/status labels
│   ├── user-encoding.ts   # User create/update payloads
│   └── ...
├── tests/                 # Bun test suite
└── README.md
```

## License

ISC

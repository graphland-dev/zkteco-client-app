# Graphland ZKT Client

Desktop app and TypeScript library for ZKTeco biometric attendance devices. Connect to a device over your local network to manage users, browse and sync attendance logs, and forward attendance events to a webhook.

[![Build desktop app](https://github.com/graphland-dev/zk-client-app/actions/workflows/build.yml/badge.svg)](https://github.com/graphland-dev/zk-client-app/actions/workflows/build.yml)
[![Latest release](https://img.shields.io/github/v/release/graphland-dev/zk-client-app)](https://github.com/graphland-dev/zk-client-app/releases/latest)

## Download

Grab the installer for your platform from the [latest release](https://github.com/graphland-dev/zk-client-app/releases/latest):

| Platform | Installer |
|----------|-----------|
| macOS (Apple Silicon) | [Graphland.ZKT.Client_0.2.0_aarch64.dmg](https://github.com/graphland-dev/zk-client-app/releases/download/v0.2.0/Graphland.ZKT.Client_0.2.0_aarch64.dmg) |
| macOS (Intel) | [Graphland.ZKT.Client_0.2.0_x64.dmg](https://github.com/graphland-dev/zk-client-app/releases/download/v0.2.0/Graphland.ZKT.Client_0.2.0_x64.dmg) |
| Windows (installer) | [Graphland.ZKT.Client_0.2.0_x64-setup.exe](https://github.com/graphland-dev/zk-client-app/releases/download/v0.2.0/Graphland.ZKT.Client_0.2.0_x64-setup.exe) |
| Windows (MSI) | [Graphland.ZKT.Client_0.2.0_x64_en-US.msi](https://github.com/graphland-dev/zk-client-app/releases/download/v0.2.0/Graphland.ZKT.Client_0.2.0_x64_en-US.msi) |

> **Note:** builds are currently unsigned.
> On **macOS**, right-click the app → **Open** the first time (or allow it under System Settings → Privacy & Security) to get past Gatekeeper.
> On **Windows**, click **More info → Run anyway** if SmartScreen warns.

## Features

- **Device connection** — connect to a ZKTeco device by IP over TCP (UDP fallback), with CommKey authentication and connection testing.
- **User management** — list, create, update, and delete users on the device; CSV import/export.
- **Attendance logs** — browse attendance records and sync them off the device.
- **Webhook forwarding** — push attendance events to your own HTTP endpoint, with an optional signing secret.
- **Device tools** — refresh device info, open door, reset device.

## Project structure

This is a Bun workspace monorepo:

| Package | Description |
|---------|-------------|
| [`packages/zkteco`](packages/zkteco) | TypeScript client library for ZKTeco devices (TCP/UDP protocol, users, attendance). No runtime dependencies. See its [README](packages/zkteco/README.md) for the API. |
| [`packages/zk-gui`](packages/zk-gui) | Desktop app: Tauri 2 shell + React frontend. Device communication runs in a Bun-compiled sidecar binary (`zk-sidecar`) that exposes a local HTTP API to the UI. |

## Development

Requirements: [Bun](https://bun.sh), [Rust](https://rustup.rs) (for the Tauri shell).

```bash
bun install

# Run the desktop app in dev mode (Vite + Tauri, sidecar runs from source)
bun run dev

# Type-check everything
bun run typecheck

# Run zkteco unit tests
bun run test
```

## Building

Local production build for your current platform:

```bash
bun run build              # typecheck + tests + Tauri bundle
bun run build:fast         # skip typecheck and tests
```

Installers land in `packages/zk-gui/src-tauri/src-tauri/target/release/bundle/`.

### Releasing (all platforms)

Tauri cannot cross-compile, so multi-platform installers are built by the
[GitHub Actions workflow](.github/workflows/build.yml) on native macOS and Windows runners.
Publishing a release triggers it:

```bash
gh release create v0.2.0 --title "v0.2.0" --generate-notes
```

The workflow builds macOS (Apple Silicon + Intel) DMGs and Windows MSI/NSIS installers, and attaches them to the published release. It can also be run manually from the [Actions tab](https://github.com/graphland-dev/zk-client-app/actions/workflows/build.yml) (installers are uploaded as workflow artifacts instead).

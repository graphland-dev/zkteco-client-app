#!/usr/bin/env bun
/**
 * Build Graphland ZKT Client (desktop app).
 *
 * Usage:
 *   bun run build
 *   bun run build -- --skip-tests
 *   bun run build -- --skip-typecheck --skip-tests
 *   bun run build -- --debug
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const guiDir = join(root, "packages/zk-gui");

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Build Graphland ZKT Client

Usage:
  bun run build [options]

Options:
  --skip-typecheck   Skip TypeScript checks
  --skip-tests       Skip zk-client unit tests
  --debug            Create a debug Tauri bundle (faster, larger)
  -h, --help         Show this help
`);
  process.exit(0);
}

const skipTypecheck = args.includes("--skip-typecheck");
const skipTests = args.includes("--skip-tests");
const debug = args.includes("--debug");

function run(label, command, commandArgs, options = {}) {
  console.log(`\n==> ${label}`);
  console.log(`    ${command} ${commandArgs.join(" ")}`);

  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? root,
    stdio: "inherit",
    env: { ...process.env, ...options.env },
  });

  if (result.status !== 0) {
    console.error(`\nBuild failed at step: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("Graphland ZKT Client — production build\n");

if (!skipTypecheck) {
  run("Typecheck zk-client", "bun", ["run", "--filter", "@graphland/zk-client", "typecheck"]);
  run("Typecheck zk-gui", "bun", ["run", "--filter", "@graphland/zk-gui", "typecheck"]);
}

if (!skipTests) {
  run("Test zk-client", "bun", ["run", "--filter", "@graphland/zk-client", "test"]);
}

const tauriArgs = ["x", "tauri", "build"];
if (debug) {
  tauriArgs.push("--debug");
}

run("Build desktop app (Vite + sidecar + Tauri)", "bun", tauriArgs, {
  cwd: guiDir,
  env: {
    CARGO_TARGET_DIR: "src-tauri/target",
  },
});

console.log("\nBuild complete.");
console.log(`Artifacts: packages/zk-gui/src-tauri/src-tauri/target/release/`);
console.log(`  - zk-client-gui.exe (standalone)`);
console.log(`  - bundle/nsis/*-setup.exe (installer)`);
console.log(`  - bundle/msi/*.msi (installer)`);

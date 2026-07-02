import { copyFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Maps a Rust target triple to the matching Bun compile target.
const RUST_TO_BUN: Record<string, string> = {
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
};

/** Tauri MSI/NSIS bundling on Windows expects the MSVC triple even when Rust uses GNU. */
const WINDOWS_SIDECAR_ALIASES = [
  "x86_64-pc-windows-gnu",
  "x86_64-pc-windows-msvc",
] as const;
function getRustHostTriple(): string {
  const output = Bun.spawnSync(["rustc", "-vV"], { stdout: "pipe" });
  if (output.exitCode !== 0) {
    throw new Error("rustc -vV failed; install Rust to build the sidecar");
  }

  const text = new TextDecoder().decode(output.stdout);
  const match = text.match(/^host: (.+)$/m);
  if (!match) {
    throw new Error("Could not parse rustc host triple");
  }

  return match[1]!;
}

// Tauri sets TAURI_ENV_TARGET_TRIPLE for before-build commands, so
// `tauri build --target <triple>` cross-arch builds pick the right sidecar.
const rustTriple = process.env.TAURI_ENV_TARGET_TRIPLE ?? getRustHostTriple();
const bunTarget = RUST_TO_BUN[rustTriple];

if (!bunTarget) {
  throw new Error(
    `No Bun compile target for Rust triple "${rustTriple}". ` +
      `Supported: ${Object.keys(RUST_TO_BUN).join(", ")}`,
  );
}

const ext = rustTriple.includes("windows") ? ".exe" : "";
const outDir = fileURLToPath(new URL("../src-tauri/binaries/", import.meta.url));
const outfile = join(outDir, `zk-sidecar-${rustTriple}${ext}`);

console.log(`Building sidecar for ${rustTriple} (${bunTarget}) -> ${outfile}`);

const result = await Bun.build({
  entrypoints: ["./src/sidecar.ts"],
  compile: {
    target: bunTarget as "bun-darwin-arm64",
    outfile,
  },
  external: [],
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}

const sidecarNames =
  process.platform === "win32"
    ? WINDOWS_SIDECAR_ALIASES.map((triple) => `zk-sidecar-${triple}${ext}`)
    : [`zk-sidecar-${rustTriple}${ext}`];

for (const name of sidecarNames) {
  const dest = join(outDir, name);
  if (dest !== outfile) {
    copyFileSync(outfile, dest);
    console.log(`Copied sidecar -> ${dest}`);
  }
}

const keep = new Set(sidecarNames);
for (const name of readdirSync(outDir)) {
  if (name.startsWith("zk-sidecar-") && !keep.has(name)) {
    unlinkSync(join(outDir, name));
    console.log(`Removed stale sidecar: ${name}`);
  }
}

console.log("Sidecar build complete.");
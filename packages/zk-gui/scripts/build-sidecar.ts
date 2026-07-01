import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BUN_TARGETS: Record<string, string> = {
  "darwin-arm64": "bun-darwin-arm64",
  "darwin-x64": "bun-darwin-x64",
  "win32-x64": "bun-windows-x64",
};

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

const key = `${process.platform}-${process.arch}`;
const bunTarget = BUN_TARGETS[key];

if (!bunTarget) {
  throw new Error(`Unsupported build platform: ${key}`);
}

const rustTriple = getRustHostTriple();
const ext = process.platform === "win32" ? ".exe" : "";
const outDir = fileURLToPath(new URL("../src-tauri/binaries/", import.meta.url));
const outfile = join(outDir, `zk-sidecar-${rustTriple}${ext}`);

console.log(`Building sidecar for ${key} (${rustTriple}) -> ${outfile}`);

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

console.log("Sidecar build complete.");

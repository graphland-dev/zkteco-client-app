const TARGETS: Record<string, { bunTarget: string; triple: string; ext: string }> = {
  "darwin-arm64": {
    bunTarget: "bun-darwin-arm64",
    triple: "aarch64-apple-darwin",
    ext: "",
  },
  "darwin-x64": {
    bunTarget: "bun-darwin-x64",
    triple: "x86_64-apple-darwin",
    ext: "",
  },
  "win32-x64": {
    bunTarget: "bun-windows-x64",
    triple: "x86_64-pc-windows-msvc",
    ext: ".exe",
  },
};

const key = `${process.platform}-${process.arch}`;
const target = TARGETS[key];

if (!target) {
  throw new Error(`Unsupported build platform: ${key}`);
}

const outDir = new URL("../src-tauri/binaries/", import.meta.url).pathname;
const outfile = `${outDir}/zk-sidecar-${target.triple}${target.ext}`;

console.log(`Building sidecar for ${key} -> ${outfile}`);

const result = await Bun.build({
  entrypoints: ["./src/sidecar.ts"],
  compile: {
    target: target.bunTarget as "bun-darwin-arm64",
    outfile,
  },
  external: [],
});

if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}

console.log("Sidecar build complete.");

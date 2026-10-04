// Build a standalone `mdrender` executable for the current platform with Node's Single
// Executable Applications (SEA): one file with Node, the bundled program and its assets
// (fonts, stylesheets, Mermaid). Run `npm run build` first.
//
//   node scripts/build-sea.mjs            → build/sea/mdrender(.exe)
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outDir = path.join(root, "build", "sea");
const isWindows = process.platform === "win32";
const exe = path.join(outDir, isWindows ? "mdrender.exe" : "mdrender");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 1. Bundle the CLI into one CommonJS file (SEA entry points must be CommonJS).
const bundle = path.join(outDir, "mdrender.cjs");
await build({
  entryPoints: [path.join(root, "src", "bin.ts")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  minify: true,
  legalComments: "external",
  // Optional native speedups of `ws`; it works without them.
  external: ["bufferutil", "utf-8-validate"],
  define: { "import.meta.url": "__import_meta_url" },
  banner: { js: 'const __import_meta_url = require("url").pathToFileURL(__filename).href;' },
  logLevel: "warning",
});

// 2. Embed every runtime asset under the key the program reads it with.
const { assetManifest } = await import(new URL("../dist/assets.js", import.meta.url).href);
const assets = assetManifest();
const config = {
  main: bundle,
  output: path.join(outDir, "sea-prep.blob"),
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  assets,
};
const configFile = path.join(outDir, "sea-config.json");
writeFileSync(configFile, JSON.stringify(config, null, 2));
execFileSync(process.execPath, ["--experimental-sea-config", configFile], { stdio: "inherit" });

// 3. Copy the running Node binary and inject the blob.
copyFileSync(process.execPath, exe);
if (!isWindows) chmodSync(exe, 0o755);
const postject = path.join(root, "node_modules", "postject", "dist", "cli.js");
const args = [
  postject,
  exe,
  "NODE_SEA_BLOB",
  config.output,
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
];
if (process.platform === "darwin") args.push("--macho-segment-name", "NODE_SEA");
execFileSync(process.execPath, args, { stdio: "inherit" });
if (process.platform === "darwin") execFileSync("codesign", ["--sign", "-", exe]);

// 4. Licenses of everything shipped inside the executable (production dependencies).
const listing = execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable"], {
  cwd: root,
  encoding: "utf8",
  shell: isWindows,
});
const notices = [];
const seen = new Set();
for (const dir of listing.split(/\r?\n/).filter(Boolean).slice(1).sort()) {
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const licenseFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  const text = licenseFile ? readFileSync(path.join(dir, licenseFile), "utf8").trim() : "";
  notices.push(`${id} (${pkg.license ?? "see package"})\n\n${text}`);
}
const noticesFile = path.join(outDir, "THIRD-PARTY-NOTICES.txt");
writeFileSync(
  noticesFile,
  "mdrender bundles the following packages and fonts.\n\n" +
    notices.join(`\n\n${"=".repeat(78)}\n\n`) +
    "\n",
);
if (!existsSync(noticesFile)) throw new Error("notices not written");

console.log(`${exe} (${Object.keys(assets).length} embedded assets, ${notices.length} notices)`);

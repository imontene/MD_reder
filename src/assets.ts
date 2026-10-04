import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sea from "node:sea";

/**
 * Runtime files (fonts, stylesheets, Mermaid) addressed by a key such as
 * "katex/dist/katex.min.css" (a file inside an npm package) or "mdrender/assets/theme.css"
 * (a file of this project).
 *
 * From npm they are read from node_modules; inside the standalone executable they are embedded
 * as Node SEA assets under the same keys (see scripts/build-sea.mjs and `assetManifest`).
 */

const SELF = "mdrender";

/** Folder holding package.json: the project root, both from src/ (dev) and dist/ (build). */
const projectRoot = () => path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const packageRoots = new Map<string, string>();

/** Root folder of an installed package, even when its "exports" hide package.json. */
function packageRoot(name: string): string {
  let root = packageRoots.get(name);
  if (root) return root;
  const require = createRequire(import.meta.url);
  let dir: string;
  try {
    dir = path.dirname(require.resolve(`${name}/package.json`));
  } catch {
    dir = path.dirname(require.resolve(name));
    while (!existsSync(path.join(dir, "package.json"))) dir = path.dirname(dir);
  }
  root = dir;
  packageRoots.set(name, root);
  return root;
}

function splitKey(key: string): [string, string] {
  const parts = key.split("/");
  const scoped = key.startsWith("@");
  const name = parts.slice(0, scoped ? 2 : 1).join("/");
  return [name, parts.slice(scoped ? 2 : 1).join("/")];
}

/** Absolute path of an asset when running from node_modules (not inside the executable). */
export function assetPath(key: string): string {
  const [name, rest] = splitKey(key);
  const root = name === SELF ? projectRoot() : packageRoot(name);
  // Project assets live in src/assets (dev) or dist/assets (build), next to this module.
  if (name === SELF && rest.startsWith("assets/")) {
    return path.join(fileURLToPath(new URL(".", import.meta.url)), rest);
  }
  return path.join(root, rest);
}

const isSea = (): boolean => {
  try {
    return sea.isSea();
  } catch {
    return false;
  }
};

export function readAsset(key: string): Buffer {
  if (isSea()) return Buffer.from(sea.getRawAsset(key) as ArrayBuffer);
  return readFileSync(assetPath(key));
}

export const readTextAsset = (key: string): string => readAsset(key).toString("utf8");

/** Same-package key for a path relative to another asset (e.g. a font next to its CSS). */
export function relativeAsset(fromKey: string, relative: string): string {
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromKey), relative));
}

export const INTER_DIR = "inter-ui/web";
/** Inter faces in use: regular, semibold and bold, each with its italic. */
export const INTER_FACES = [
  { weight: 400, style: "normal", file: "Inter-Regular.woff2" },
  { weight: 400, style: "italic", file: "Inter-Italic.woff2" },
  { weight: 600, style: "normal", file: "Inter-SemiBold.woff2" },
  { weight: 600, style: "italic", file: "Inter-SemiBoldItalic.woff2" },
  { weight: 700, style: "normal", file: "Inter-Bold.woff2" },
  { weight: 700, style: "italic", file: "Inter-BoldItalic.woff2" },
] as const;
export const MONO_STYLESHEETS = [
  "@fontsource/jetbrains-mono/400.css",
  "@fontsource/jetbrains-mono/400-italic.css",
  "@fontsource/jetbrains-mono/700.css",
];
export const KATEX_CSS = "katex/dist/katex.min.css";
export const MERMAID_JS = "mermaid/dist/mermaid.min.js";
export const THEMES = ["mdrender/assets/theme.css", "mdrender/assets/theme-dark.css"];
export const PACKAGE_JSON = "mdrender/package.json";

/** Fonts referenced by a stylesheet as url(...woff2), as asset keys. */
export function woff2References(cssKey: string, css: string): string[] {
  return [...css.matchAll(/url\((['"]?)([^)'"]+\.woff2)\1\)/g)].map((m) =>
    relativeAsset(cssKey, m[2]!),
  );
}

/**
 * Every asset the program reads, as key → file on disk. Used by the executable build to embed
 * them; only callable from a normal (node_modules) install.
 */
export function assetManifest(): Record<string, string> {
  const keys = new Set<string>([PACKAGE_JSON, ...THEMES, MERMAID_JS]);
  for (const { file } of INTER_FACES) keys.add(`${INTER_DIR}/${file}`);
  for (const cssKey of [...MONO_STYLESHEETS, KATEX_CSS]) {
    keys.add(cssKey);
    for (const font of woff2References(cssKey, readTextAsset(cssKey))) keys.add(font);
  }
  return Object.fromEntries([...keys].sort().map((key) => [key, assetPath(key)]));
}

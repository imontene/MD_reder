import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { BrowserNotFoundError } from "../errors.js";

export interface DetectOptions {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  exists?: (file: string) => boolean;
}

/** Look up an environment variable case-insensitively (Windows env names are not case-sensitive). */
function getEnv(env: Record<string, string | undefined>, name: string): string | undefined {
  if (env[name] !== undefined) return env[name];
  const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
}

const WINDOWS_APPS = [
  "Google\\Chrome\\Application\\chrome.exe",
  "Chromium\\Application\\chrome.exe",
  "Microsoft\\Edge\\Application\\msedge.exe",
  "BraveSoftware\\Brave-Browser\\Application\\brave.exe",
];

const LINUX_COMMANDS = [
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
  "microsoft-edge",
  "microsoft-edge-stable",
  "brave-browser",
];

const LINUX_FIXED = [
  "/opt/google/chrome/chrome",
  "/opt/microsoft/msedge/msedge",
  "/snap/bin/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

const MAC_APPS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];

/** Well-known Chromium-based browser locations for a platform, in order of preference. */
export function browserCandidates(
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
): string[] {
  if (platform === "win32") {
    const roots = ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"]
      .map((name) => getEnv(env, name))
      .filter((root): root is string => Boolean(root));
    return WINDOWS_APPS.flatMap((app) => roots.map((root) => path.win32.join(root, app)));
  }
  if (platform === "darwin") {
    return MAC_APPS;
  }
  const dirs = (getEnv(env, "PATH") ?? "").split(":").filter(Boolean);
  const fromPath = LINUX_COMMANDS.flatMap((cmd) => dirs.map((dir) => path.posix.join(dir, cmd)));
  return [...new Set([...fromPath, ...LINUX_FIXED])];
}

function isFile(file: string): boolean {
  try {
    return existsSync(file) && statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Find a Chromium-based browser executable.
 *
 * Order: the explicit path (`--browser`), then `MDRENDER_BROWSER`, then well-known locations.
 * An explicit path or env var that does not exist is an error rather than silently ignored.
 */
export function findBrowser(explicit?: string, options: DetectOptions = {}): string {
  const env = options.env ?? process.env;
  const exists = options.exists ?? isFile;

  const requested = explicit ?? getEnv(env, "MDRENDER_BROWSER");
  if (requested) {
    if (exists(requested)) return requested;
    const source = explicit ? "--browser" : "MDRENDER_BROWSER";
    throw new BrowserNotFoundError(`browser not found at ${requested} (from ${source})`);
  }

  const found = browserCandidates(options.platform, env).find(exists);
  if (found) return found;

  throw new BrowserNotFoundError(
    "no Chromium-based browser found (Google Chrome, Chromium, Microsoft Edge or Brave).\n" +
      "Install one, or point to it with --browser <path> or the MDRENDER_BROWSER variable.",
  );
}

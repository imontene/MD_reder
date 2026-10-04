import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Per-user folder where `mdrender setup` keeps its downloaded browser:
 * %LOCALAPPDATA%\mdrender on Windows, ~/Library/Caches/mdrender on macOS and
 * $XDG_CACHE_HOME/mdrender (or ~/.cache/mdrender) elsewhere. MDRENDER_CACHE_DIR overrides it.
 */
export function cacheDir(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  home = os.homedir(),
): string {
  if (env.MDRENDER_CACHE_DIR) return path.resolve(env.MDRENDER_CACHE_DIR);
  if (platform === "win32") {
    return path.win32.join(
      env.LOCALAPPDATA ?? path.win32.join(home, "AppData", "Local"),
      "mdrender",
    );
  }
  if (platform === "darwin") return path.posix.join(home, "Library", "Caches", "mdrender");
  return path.posix.join(env.XDG_CACHE_HOME ?? path.posix.join(home, ".cache"), "mdrender");
}

/** Small record written by `mdrender setup` pointing at the browser it installed. */
export interface InstalledBrowserRecord {
  executablePath: string;
  buildId: string;
  installedAt: string;
}

export const RECORD_FILE = "browser.json";

/** The browser installed by `mdrender setup`, if it is still there. */
export function installedBrowser(dir = cacheDir()): string | undefined {
  try {
    const record = JSON.parse(
      readFileSync(path.join(dir, RECORD_FILE), "utf8"),
    ) as InstalledBrowserRecord;
    return existsSync(record.executablePath) ? record.executablePath : undefined;
  } catch {
    return undefined;
  }
}

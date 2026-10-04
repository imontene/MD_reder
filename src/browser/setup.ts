import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  Browser,
  BrowserPlatform,
  detectBrowserPlatform,
  install,
  resolveBuildId,
} from "@puppeteer/browsers";
import { ExitCode } from "../exit-codes.js";
import type { Io } from "../run.js";
import { cacheDir, RECORD_FILE, type InstalledBrowserRecord } from "./cache.js";
import { findBrowser } from "./detect.js";

export interface SetupOptions {
  io: Io;
  /** Download even when a system browser is available. */
  force?: boolean;
  dir?: string;
}

/**
 * Download Chrome Headless Shell (the official headless build of Chrome, ~100 MB) into the
 * user's cache folder, for machines without Chrome, Edge or Chromium.
 */
export async function setup({
  io,
  force = false,
  dir = cacheDir(),
}: SetupOptions): Promise<ExitCode> {
  let system: string | undefined;
  try {
    system = findBrowser();
  } catch {
    // none installed: download one
  }
  if (system && !force) {
    io.err(
      `A browser is already installed: ${system}\nNo download needed (use --force to download anyway).\n`,
    );
    io.out(`${system}\n`);
    return ExitCode.Ok;
  }

  const platform = detectBrowserPlatform();
  if (!platform || platform === BrowserPlatform.LINUX_ARM) {
    io.err(
      "error: Chrome Headless Shell is not published for this platform.\n" +
        "Install Chromium with your package manager (e.g. `sudo apt install chromium`).\n",
    );
    return ExitCode.BrowserNotFound;
  }

  const browser = Browser.CHROMEHEADLESSSHELL;
  let buildId: string;
  let executablePath: string;
  try {
    io.err("Looking up the latest stable Chrome Headless Shell…\n");
    buildId = await resolveBuildId(browser, platform, "stable");
    io.err(`Downloading Chrome Headless Shell ${buildId} into ${dir}\n`);

    let lastPercent = -1;
    ({ executablePath } = await install({
      browser,
      buildId,
      platform,
      cacheDir: dir,
      downloadProgressCallback: (done, total) => {
        const percent = total ? Math.floor((done / total) * 100) : 0;
        if (percent >= lastPercent + 10 || percent === 100) {
          lastPercent = percent;
          io.err(`  ${percent}%\n`);
        }
      },
    }));
  } catch (error) {
    io.err(
      `error: could not download the browser: ${(error as Error).message}\n` +
        "Check your internet connection or proxy (HTTPS_PROXY), or install Chrome, Edge or\n" +
        "Chromium yourself.\n",
    );
    return ExitCode.BrowserNotFound;
  }

  mkdirSync(dir, { recursive: true });
  const record: InstalledBrowserRecord = {
    executablePath,
    buildId,
    installedAt: new Date().toISOString(),
  };
  writeFileSync(path.join(dir, RECORD_FILE), JSON.stringify(record, null, 2));
  io.err(`Installed: ${executablePath}\n`);
  io.out(`${executablePath}\n`);
  return ExitCode.Ok;
}

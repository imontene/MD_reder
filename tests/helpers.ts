import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findBrowser } from "../src/browser/detect.js";

export const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

export const tempDir = () => mkdtempSync(path.join(os.tmpdir(), "mdrender-test-"));

/** The browser to use for PDF tests, or undefined when none is installed. */
export function testBrowser(): string | undefined {
  try {
    return findBrowser();
  } catch {
    return undefined;
  }
}

/** In CI a browser must be available: PDF tests fail instead of being skipped. */
export const browserRequired =
  process.env.CI === "true" || process.env.MDRENDER_REQUIRE_BROWSER === "1";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { normalizeOptions, OptionsError, type DocumentOptions } from "./options.js";

export const CONFIG_FILE = "mdrender.config.json";

/** Find `mdrender.config.json` in `startDir` or the nearest parent directory. */
export function findConfigFile(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Read and validate a config file. Relative paths inside it resolve against its folder. */
export function loadConfig(file: string): Partial<DocumentOptions> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new OptionsError(`${file}: ${(error as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new OptionsError(`${file}: the configuration must be a JSON object`);
  }
  return normalizeOptions(raw as Record<string, unknown>, file, path.dirname(file));
}

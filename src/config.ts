import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { normalizeOptions, OptionsError, unknownOptions, type DocumentOptions } from "./options.js";

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

export interface LoadedConfig {
  options: Partial<DocumentOptions>;
  /** Problems that do not stop the conversion, such as misspelled option names. */
  warnings: string[];
}

/** Read and validate a config file. Relative paths inside it resolve against its folder. */
export function loadConfig(file: string): Partial<DocumentOptions> {
  return readConfig(file).options;
}

/** Like `loadConfig`, also reporting unknown option names (likely typos). */
export function readConfig(file: string): LoadedConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new OptionsError(`${file}: ${(error as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new OptionsError(`${file}: the configuration must be a JSON object`);
  }
  const record = raw as Record<string, unknown>;
  const relative = path.relative(process.cwd(), file);
  const shown =
    relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : file;
  const warnings = unknownOptions(record).map(
    ({ key, suggestion }) =>
      `${shown}: unknown option "${key}"` +
      (suggestion ? ` (did you mean "${suggestion}"?)` : " (ignored)"),
  );
  return { options: normalizeOptions(record, file, path.dirname(file)), warnings };
}

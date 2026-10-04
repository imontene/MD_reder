import path from "node:path";
import { ExitCode } from "./exit-codes.js";
import { MdRenderError } from "./errors.js";
import { DEFAULT_LANG } from "./i18n.js";

export const PAGE_SIZES = ["A3", "A4", "A5", "Letter", "Legal", "Tabloid"] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const MERMAID_THEMES = ["default", "neutral", "dark", "forest", "base"] as const;
export type MermaidTheme = (typeof MERMAID_THEMES)[number];

export const BUILTIN_THEMES = ["light", "dark"] as const;

/** Rendering options, merged from defaults < config file < front matter < command line. */
export interface DocumentOptions {
  pageSize: PageSize;
  /** CSS margin shorthand: 1 to 4 lengths in mm, cm, in or px. */
  margin: string;
  landscape: boolean;
  toc: boolean;
  /** Deepest heading level listed in the table of contents. */
  tocDepth: number;
  /** Default footer with "page / pages". Ignored when `footer` is set. */
  pageNumbers: boolean;
  /** Header/footer text; see render/header-footer.ts for placeholders and `|` columns. */
  header?: string;
  footer?: string;
  /** Mermaid theme; when unset, "neutral" for light pages and "dark" for the dark theme. */
  mermaidTheme?: MermaidTheme;
  /** "light", "dark", or the absolute path of a stylesheet that replaces the built-in theme. */
  theme: string;
  /** Extra stylesheets (absolute paths), applied after the built-in theme. */
  css: string[];
  /** BCP 47 language of the document, e.g. "es" or "en". */
  lang: string;
  title?: string;
  subtitle?: string;
  author?: string;
  date?: string;
}

export const DEFAULT_OPTIONS: DocumentOptions = {
  pageSize: "A4",
  margin: "20mm",
  landscape: false,
  toc: false,
  tocDepth: 3,
  pageNumbers: true,
  theme: "light",
  css: [],
  lang: DEFAULT_LANG,
};

export class OptionsError extends MdRenderError {
  constructor(message: string) {
    super(message, ExitCode.Usage);
  }
}

const LENGTH = /^\d+(\.\d+)?(mm|cm|in|px)$/;

/** Parse a CSS margin shorthand into the four sides, or throw. */
export function parseMargin(margin: string): {
  top: string;
  right: string;
  bottom: string;
  left: string;
} {
  const parts = margin.trim().split(/\s+/);
  if (parts.length < 1 || parts.length > 4 || !parts.every((p) => LENGTH.test(p))) {
    throw new OptionsError(
      `invalid margin "${margin}": use 1 to 4 lengths in mm, cm, in or px, e.g. "20mm" or "15mm 20mm"`,
    );
  }
  const [top, right = top, bottom = top, left = right] = parts as [string, ...string[]];
  return { top, right, bottom, left };
}

const toCamel = (key: string) => key.replace(/[-_]([a-z])/g, (_m, c: string) => c.toUpperCase());

type Validator = (value: unknown, describe: string, baseDir: string) => unknown;

const isString = (v: unknown): v is string => typeof v === "string";

const text: Validator = (value, describe) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (isString(value) || typeof value === "number") return String(value);
  throw new OptionsError(`${describe} must be text`);
};

const bool: Validator = (value, describe) => {
  if (typeof value === "boolean") return value;
  throw new OptionsError(`${describe} must be true or false`);
};

const oneOf =
  (choices: readonly string[]): Validator =>
  (value, describe) => {
    const match = choices.find((c) => isString(value) && c.toLowerCase() === value.toLowerCase());
    if (match) return match;
    throw new OptionsError(`${describe} must be one of: ${choices.join(", ")}`);
  };

const VALIDATORS: Record<keyof DocumentOptions, Validator> = {
  pageSize: oneOf(PAGE_SIZES),
  margin: (value, describe) => {
    const margin = text(value, describe, "") as string;
    try {
      parseMargin(margin);
    } catch (error) {
      throw new OptionsError(`${describe}: ${(error as Error).message}`);
    }
    return margin;
  },
  landscape: bool,
  toc: bool,
  tocDepth: (value, describe) => {
    const depth = Number(value);
    if (Number.isInteger(depth) && depth >= 1 && depth <= 6) return depth;
    throw new OptionsError(`${describe} must be a whole number from 1 to 6`);
  },
  pageNumbers: bool,
  header: text,
  footer: text,
  mermaidTheme: oneOf(MERMAID_THEMES),
  theme: (value, describe, baseDir) => {
    const theme = text(value, describe, baseDir) as string;
    const builtin = BUILTIN_THEMES.find((t) => t === theme.toLowerCase());
    if (builtin) return builtin;
    if (/\.css$/i.test(theme)) return path.resolve(baseDir, theme);
    throw new OptionsError(`${describe} must be light, dark or a .css file`);
  },
  css: (value, describe, baseDir) => {
    const list = Array.isArray(value) ? value : [value];
    if (!list.every(isString)) throw new OptionsError(`${describe} must be a file path or a list`);
    return list.map((file) => path.resolve(baseDir, file));
  },
  lang: text,
  title: text,
  subtitle: text,
  author: text,
  date: text,
};

/**
 * Validate options from a config file, front matter or the command line.
 *
 * Keys may be camelCase or kebab-case (`page-size`). Unknown keys are ignored so front matter can
 * hold other metadata. Relative CSS paths resolve against `baseDir`.
 */
export function normalizeOptions(
  raw: Record<string, unknown>,
  source: string,
  baseDir: string,
  /** How to name a key in error messages (e.g. as a command-line flag). */
  label: (key: string) => string = (key) => `"${key}"`,
): Partial<DocumentOptions> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    const name = toCamel(key) as keyof DocumentOptions;
    const validate = VALIDATORS[name];
    if (!validate) continue;
    result[name] = validate(value, `${source}: ${label(key)}`, baseDir);
  }
  return result as Partial<DocumentOptions>;
}

/** Merge option layers, later ones winning. CSS lists accumulate instead of replacing. */
export function mergeOptions(...layers: Partial<DocumentOptions>[]): DocumentOptions {
  const merged: DocumentOptions = { ...DEFAULT_OPTIONS, css: [] };
  for (const layer of layers) {
    const { css, ...rest } = layer;
    Object.assign(merged, rest);
    if (css) merged.css.push(...css);
  }
  return merged;
}

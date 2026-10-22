import path from "node:path";
import { ExitCode } from "./exit-codes.js";
import { MdRenderError } from "./errors.js";
import { DEFAULT_LANG } from "./i18n.js";

export const PAGE_SIZES = ["A3", "A4", "A5", "Letter", "Legal", "Tabloid"] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const ORIENTATIONS = ["portrait", "landscape"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export type Margins = { top: string; right: string; bottom: string; left: string };

export const MERMAID_THEMES = ["default", "neutral", "dark", "forest", "base"] as const;
export type MermaidTheme = (typeof MERMAID_THEMES)[number];

export const MERMAID_FLIPS = ["auto", "never"] as const;
export type MermaidFlip = (typeof MERMAID_FLIPS)[number];

export const BUILTIN_THEMES = ["light", "dark"] as const;

export const TEXT_FONTS = ["manrope", "inter"] as const;
export type TextFont = (typeof TEXT_FONTS)[number];

export const DENSITIES = ["normal", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

/** Rendering options, merged from defaults < config file < front matter < command line. */
export interface DocumentOptions {
  pageSize: PageSize;
  /** CSS margin shorthand: 1 to 4 lengths in mm, cm, in or px. */
  margin: string;
  /** Single sides, overriding the shorthand (see `resolveMargins`). */
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  orientation: Orientation;
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
  /** Try several layouts of each flowchart and keep the one whose text prints largest. */
  mermaidAutofit: boolean;
  /** Whether autofit may turn a flowchart to the other axis (LR ↔ TB) when it reads far better. */
  mermaidFlip: MermaidFlip;
  /** Justify paragraphs in the PDF (body, quotes, alerts), breaking long words with hyphens. */
  justify: boolean;
  /** Typeface of the text: Manrope or Inter (code is always JetBrains Mono). */
  font: TextFont;
  /** Vertical spacing: "compact" tightens line height, paragraph and heading spacing. */
  density: Density;
  /** Base font size of the text, e.g. "10pt"; when unset, the theme's (10.5pt). */
  fontSize?: string;
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
  pageSize: "Letter",
  margin: "10mm",
  orientation: "portrait",
  toc: false,
  tocDepth: 3,
  pageNumbers: true,
  mermaidAutofit: true,
  mermaidFlip: "auto",
  font: "manrope",
  justify: true,
  density: "normal",
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
export function parseMargin(margin: string): Margins {
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

const length: Validator = (value, describe) => {
  const raw = text(value, describe, "") as string;
  const trimmed = raw.trim();
  if (LENGTH.test(trimmed)) return trimmed;
  throw new OptionsError(`${describe} must be a length in mm, cm, in or px, e.g. "10mm"`);
};

/** Text size of the built-in themes (theme.css), when --font-size is not given. */
export const DEFAULT_FONT_SIZE = "10.5pt";

/** Font sizes accepted by --font-size, in points or pixels. */
const FONT_SIZE = /^(\d+(?:\.\d+)?)(pt|px)$/;
const FONT_SIZE_PT = { min: 6, max: 24 };

/** A font size in CSS pixels ("10.5pt" → 14). */
export function fontSizePx(size: string): number {
  const match = FONT_SIZE.exec(size);
  if (!match) throw new Error(`invalid font size: ${size}`);
  return match[2] === "pt" ? (Number(match[1]) * 4) / 3 : Number(match[1]);
}

const fontSize: Validator = (value, describe) => {
  const size = (text(value, describe, "") as string).trim();
  if (FONT_SIZE.test(size)) {
    const pt = (fontSizePx(size) * 3) / 4;
    if (pt >= FONT_SIZE_PT.min && pt <= FONT_SIZE_PT.max) return size;
  }
  throw new OptionsError(
    `${describe} must be a size in pt or px from ${FONT_SIZE_PT.min}pt to ${FONT_SIZE_PT.max}pt, e.g. "10pt"`,
  );
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
  marginTop: length,
  marginRight: length,
  marginBottom: length,
  marginLeft: length,
  orientation: oneOf(ORIENTATIONS),
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
  mermaidAutofit: bool,
  mermaidFlip: oneOf(MERMAID_FLIPS),
  font: oneOf(TEXT_FONTS),
  justify: bool,
  density: oneOf(DENSITIES),
  fontSize,
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
    // `landscape: true` is kept as a shorthand for `orientation: landscape`.
    if (toCamel(key) === "landscape") {
      const landscape = bool(value, `${source}: ${label(key)}`, baseDir);
      result.orientation = landscape ? "landscape" : "portrait";
      continue;
    }
    const name = toCamel(key) as keyof DocumentOptions;
    const validate = VALIDATORS[name];
    if (!validate) continue;
    result[name] = validate(value, `${source}: ${label(key)}`, baseDir);
  }
  return result as Partial<DocumentOptions>;
}

const SIDES = ["marginTop", "marginRight", "marginBottom", "marginLeft"] as const;

/**
 * Merge option layers, later ones winning. CSS lists accumulate instead of replacing. A layer
 * that sets the `margin` shorthand also replaces single-side margins from earlier layers, so
 * `--margin 15mm` on the command line is not partly undone by `marginLeft` in a config file.
 */
export function mergeOptions(...layers: Partial<DocumentOptions>[]): DocumentOptions {
  const merged: DocumentOptions = { ...DEFAULT_OPTIONS, css: [] };
  for (const layer of layers) {
    const { css, ...rest } = layer;
    if (rest.margin !== undefined) for (const side of SIDES) delete merged[side];
    Object.assign(merged, rest);
    if (css) merged.css.push(...css);
  }
  return merged;
}

/** The four page margins: the `margin` shorthand, with single-side options on top. */
export function resolveMargins(options: DocumentOptions): Margins {
  const base = parseMargin(options.margin);
  return {
    top: options.marginTop ?? base.top,
    right: options.marginRight ?? base.right,
    bottom: options.marginBottom ?? base.bottom,
    left: options.marginLeft ?? base.left,
  };
}

/** Edit distance between two strings (insertions, deletions, substitutions). */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[b.length]!;
}

const toKebab = (key: string) => key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

/** Every option name accepted in a config file, in camelCase. */
export const OPTION_KEYS: readonly string[] = [...Object.keys(VALIDATORS), "landscape"];

export interface UnknownOption {
  key: string;
  /** Closest known option, written in the same style (camelCase or kebab-case) as `key`. */
  suggestion?: string;
}

/**
 * Keys that are not options, with the closest known option when one is near: catches typos
 * such as "pagesize" or "margn" that would otherwise be ignored silently.
 */
export function unknownOptions(raw: Record<string, unknown>): UnknownOption[] {
  const unknown: UnknownOption[] = [];
  for (const key of Object.keys(raw)) {
    if (OPTION_KEYS.includes(toCamel(key))) continue;
    const plain = key.toLowerCase().replace(/[-_]/g, "");
    let best: string | undefined;
    let bestDistance = Infinity;
    for (const known of OPTION_KEYS) {
      const distance = editDistance(plain, known.toLowerCase());
      if (distance < bestDistance) {
        best = known;
        bestDistance = distance;
      }
    }
    const close = best !== undefined && bestDistance <= Math.max(1, Math.floor(plain.length / 4));
    const suggestion = close ? (key.includes("-") ? toKebab(best!) : best) : undefined;
    unknown.push({ key, suggestion });
  }
  return unknown;
}

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { listAssets, MAGAZINES_KEY, readAsset } from "../assets.js";
import type { Diagnostic } from "../diagnostics.js";
import type { CoverInk, CoverTextPosition, DocumentOptions, Margins } from "../options.js";
import { columns } from "./header-footer.js";
import { paperSizeMm } from "./page.js";

/**
 * The magazine themes (tech_magazine, tech_magazine-dark): a full-bleed cover picture on page 1
 * and the page margins, header and footer drawn by the stylesheet.
 *
 * Cover pictures live in tech_magazine/<magazine-name>/, next to the document or shipped with
 * mdrender; the number in a file name (cover02.png → 2) is the one `cover:` picks. An optional
 * magazine.json in the same folder sets the magazine's accent and, per cover, the ink and the
 * veil behind the text:
 *
 *   { "accent": "#2f6bff", "covers": { "1": { "ink": "dark", "veil": "rgba(255,255,255,0.6)" } } }
 *
 * A cover's ink there wins over `cover-ink`: the picture decides which text colour reads on it.
 */

export const MAGAZINE_DIR = "tech_magazine";
export const DEFAULT_MAGAZINE = "AlphaZeroChess";

const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

interface CoverSettings {
  ink?: CoverInk;
  veil?: string;
}

interface MagazineSettings {
  accent?: string;
  covers?: Record<string, CoverSettings>;
}

interface CoverFile {
  number: number;
  name: string;
  read: () => Buffer;
}

interface MagazineFolder {
  /** Where the pictures were found, for messages. */
  where: string;
  covers: CoverFile[];
  settings: MagazineSettings;
}

/** Number in a file name: the last group of digits ("cover02.png" → 2). */
export function coverNumber(file: string): number | undefined {
  const match = /(\d+)(?!.*\d)/.exec(path.parse(file).name);
  return match ? Number(match[1]) : undefined;
}

function isImage(file: string): boolean {
  return path.extname(file).toLowerCase() in IMAGE_TYPES;
}

function parseSettings(text: string, where: string, diagnostics: Diagnostic[]): MagazineSettings {
  try {
    const data = JSON.parse(text) as unknown;
    if (data && typeof data === "object" && !Array.isArray(data)) return data as MagazineSettings;
  } catch {
    // reported below
  }
  diagnostics.push({
    severity: "warning",
    message: `${where}/magazine.json is not valid; ignored`,
  });
  return {};
}

function toCovers(files: { name: string; read: () => Buffer }[]): CoverFile[] {
  return files
    .filter((file) => isImage(file.name))
    .flatMap((file) => {
      const number = coverNumber(file.name);
      return number === undefined ? [] : [{ number, ...file }];
    })
    .sort((a, b) => a.number - b.number);
}

/** The magazine's folder next to the document, else the one shipped with mdrender. */
function findMagazine(name: string, baseDir: string, diagnostics: Diagnostic[]): MagazineFolder {
  const local = path.join(baseDir, MAGAZINE_DIR, name);
  if (existsSync(local) && statSync(local).isDirectory()) {
    const where = path.join(MAGAZINE_DIR, name);
    const entries = readdirSync(local).map((file) => ({
      name: file,
      read: () => readFileSync(path.join(local, file)),
    }));
    const manifest = path.join(local, "magazine.json");
    const settings = existsSync(manifest)
      ? parseSettings(readFileSync(manifest, "utf8"), where, diagnostics)
      : {};
    return { where, covers: toCovers(entries), settings };
  }
  const folderKey = `${MAGAZINES_KEY}/${name}`;
  const keys = listAssets(folderKey);
  const entries = keys.map((key) => ({
    name: path.posix.basename(key),
    read: () => readAsset(key),
  }));
  const manifest = entries.find((entry) => entry.name === "magazine.json");
  const settings = manifest
    ? parseSettings(manifest.read().toString("utf8"), `${MAGAZINE_DIR}/${name}`, diagnostics)
    : {};
  return { where: `${MAGAZINE_DIR}/${name}`, covers: toCovers(entries), settings };
}

function pickCover(
  folder: MagazineFolder,
  wanted: number | undefined,
  random: () => number,
  diagnostics: Diagnostic[],
): CoverFile | undefined {
  if (folder.covers.length === 0) return undefined;
  if (wanted !== undefined) {
    const match = folder.covers.find((cover) => cover.number === wanted);
    if (match) return match;
    const available = folder.covers.map((cover) => cover.number).join(", ");
    diagnostics.push({
      severity: "warning",
      message: `cover ${wanted} not found in ${folder.where} (available: ${available}); using a random one`,
    });
  }
  return folder.covers[Math.floor(random() * folder.covers.length)]!;
}

/** A CSS string literal. */
export const cssString = (value: string): string =>
  `"${value.replace(/[\\"]/g, "\\$&").replace(/[\r\n]+/g, " ")}"`;

export interface PageValues {
  title: string;
  author?: string;
  date?: string;
  magazine: string;
}

/** Default veil behind the cover text for each ink (theme-tech-magazine.css has the same). */
const VEILS: Record<CoverInk, string> = {
  light: "rgba(0, 0, 0, 0.6)",
  dark: "rgba(255, 255, 255, 0.6)",
};

/**
 * The veil behind the cover text, fading from the edge the text sits at. Written out without
 * var(): Chrome drops a declaration that has both var() and a value as large as a picture.
 */
const veil = (colour: string, position: CoverTextPosition) =>
  `linear-gradient(${position === "top" ? "to bottom" : "to top"}, ${colour} 0%, transparent 50%)`;

const COUNTERS: Record<string, string> = { page: "counter(page)", pages: "counter(pages)" };

/** A header/footer column ("{magazine} · {date}") as a CSS `content` value. */
function marginContent(text: string, values: PageValues): string | undefined {
  const parts: string[] = [];
  let literal = "";
  for (const piece of text.trim().split(/(\{\w+\})/)) {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    const counter = name ? COUNTERS[name] : undefined;
    if (counter) {
      if (literal) parts.push(cssString(literal));
      parts.push(counter);
      literal = "";
      continue;
    }
    const value = name ? values[name as keyof PageValues] : undefined;
    literal += value ?? piece;
  }
  if (literal) parts.push(cssString(literal));
  return parts.length ? parts.join(" ") : undefined;
}

const SIDES = ["left", "center", "right"] as const;

/** `@top-left { content: … }` and so on for a header or footer spec. */
function marginBoxes(spec: string | undefined, edge: "top" | "bottom", values: PageValues): string {
  if (!spec) return "";
  return columns(spec)
    .map((column, i) => {
      const content = marginContent(column, values);
      return content ? `  @${edge}-${SIDES[i]} { content: ${content}; }\n` : "";
    })
    .join("");
}

export interface MagazinePage {
  /** Stylesheet: cover picture, accent, masthead, page margins, header and footer. */
  css: string;
  /** Classes of the title block when it is the cover. */
  headerClass?: string;
  /** Number of the cover picture used, for --verbose. */
  coverNumber?: number;
  diagnostics: Diagnostic[];
}

export interface MagazineInput {
  options: DocumentOptions;
  margin: Margins;
  baseDir: string;
  /** The document has a title block, which becomes the cover. */
  hasCover: boolean;
  values: Omit<PageValues, "magazine">;
  /** Picks a cover when none is asked for (Math.random; tests pass their own). */
  random?: () => number;
}

/** The magazine theme's page: cover, masthead, margins, header and footer. */
export function magazinePage(input: MagazineInput): MagazinePage {
  const { options, margin, baseDir, hasCover } = input;
  const diagnostics: Diagnostic[] = [];
  const magazine = options.magazineName ?? DEFAULT_MAGAZINE;
  const values: PageValues = { ...input.values, magazine };

  const rules: string[] = [];
  const root: string[] = [];
  let headerClass: string | undefined;
  let number: number | undefined;

  const folder = findMagazine(magazine, baseDir, diagnostics);
  const accent = options.accent ?? folder.settings.accent;
  if (accent) root.push(`--tm-accent: ${accent};`);

  if (hasCover) {
    const cover = pickCover(folder, options.cover, input.random ?? Math.random, diagnostics);
    if (!cover) {
      diagnostics.push({
        severity: "warning",
        message: `no cover pictures in ${folder.where}: the cover has no picture`,
      });
    }
    const settings = cover ? (folder.settings.covers?.[String(cover.number)] ?? {}) : {};
    const ink: CoverInk = settings.ink ?? options.coverInk ?? "light";
    const position: CoverTextPosition = options.coverText ?? "top";
    if (cover) {
      const type = IMAGE_TYPES[path.extname(cover.name).toLowerCase()]!;
      // Straight into the rule, not through a custom property: Chrome drops one this large.
      const picture = `url("data:${type};base64,${cover.read().toString("base64")}")`;
      const layers = `${veil(settings.veil ?? VEILS[ink], position)}, ${picture}`;
      rules.push(`.doc-header.doc-header { background-image: ${layers}; }`);
      number = cover.number;
    }
    headerClass = `cover-ink-${ink} cover-text-${position}`;

    const [width, height] = paperSizeMm(options.pageSize, options.orientation === "landscape");
    rules.push(
      `@media print { .doc-header { width: ${width}mm; height: ${height}mm; } }`,
      `.doc-header::before { content: ${cssString(magazine)}; }`,
      options.date ? `.doc-header::after { content: ${cssString(options.date)}; }` : "",
    );
  }

  // Margins, header and footer: Chrome prints with no margins and the stylesheet draws them, so
  // that the cover can bleed to the edges of page 1.
  const footer =
    options.footer ??
    [options.date ? "{magazine} · {date}" : "{magazine}", options.pageNumbers ? "{page}" : ""].join(
      " | | ",
    );
  const page = [
    `  margin: ${margin.top} ${margin.right} ${margin.bottom} ${margin.left};\n`,
    marginBoxes(options.header, "top", values),
    marginBoxes(footer, "bottom", values),
  ].join("");
  rules.push(`@page {\n${page}}`);
  if (hasCover) {
    const none = ["top", "bottom"]
      .flatMap((edge) => SIDES.map((side) => `  @${edge}-${side} { content: none; }\n`))
      .join("");
    rules.push(`@page :first {\n  margin: 0;\n${none}}`);
  }

  if (root.length) rules.unshift(`:root { ${root.join(" ")} }`);
  return {
    css: rules.filter(Boolean).join("\n"),
    headerClass,
    coverNumber: number,
    diagnostics,
  };
}

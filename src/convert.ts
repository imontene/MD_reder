import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { findBrowser } from "./browser/detect.js";
import { findConfigFile, readConfig } from "./config.js";
import type { Diagnostic } from "./diagnostics.js";
import { extractFrontMatter } from "./frontmatter.js";
import { strings } from "./i18n.js";
import { renderMarkdown } from "./markdown/index.js";
import { buildToc, tocPlaceholder } from "./markdown/toc.js";
import {
  BUILTIN_THEMES,
  DEFAULT_FONT_SIZE,
  fontSizePx,
  isDarkTheme,
  mergeOptions,
  normalizeOptions,
  OptionsError,
  resolveMargins,
  type DocumentOptions,
  type Margins,
  type MermaidTheme,
} from "./options.js";
import type { OutputFormat } from "./paths.js";
import { BrowserSession } from "./render/browser.js";
import { DEFAULT_FOOTER, headerFooterTemplate } from "./render/header-footer.js";
import { fillMermaid, renderMermaid, type DiagramLayout } from "./render/mermaid.js";
import { SMALL_SCALE } from "./render/mermaid-fit.js";
import {
  headerFooterStyle,
  isAntigravityTheme,
  mermaidThemeVariables,
} from "./render/antigravity.js";
import { fieldImage } from "./render/field.js";
import { FONT_FAMILIES, fontStack } from "./render/fonts.js";
import { WATERMARK_CSS, watermarkHtml } from "./render/watermark.js";
import { contentHeightPx, contentWidthPx, lengthToPx, textWidthPx } from "./render/page.js";
import { buildHtmlDocument, builtinThemeCss, densityCss, plainAuthor } from "./render/template.js";
import { writeFileAtomic } from "./write.js";

/** Settings shared by every file of a run (batch, watch or preview). */
export interface RenderSettings {
  /** Explicit browser executable. */
  browser?: string;
  /**
   * Config file to use. Undefined: look for mdrender.config.json next to the input or in a
   * parent folder. `false`: use no config file.
   */
  config?: string | false;
  /** Options from the command line; they win over front matter and the config file. */
  overrides?: Partial<DocumentOptions>;
  /**
   * Let the browser download http(s) resources (remote images, stylesheets) while printing.
   * Command line only: a document cannot grant itself network access.
   */
  allowRemote?: boolean;
}

export interface ConvertOptions extends RenderSettings {
  input: string;
  output: string;
  format: OutputFormat;
  /** Reuse a browser across conversions; without it each conversion starts its own. */
  browsers?: BrowserPool;
}

export interface ConvertResult {
  output: string;
  /** Problems found while rendering; the output is still written, with errors shown inline. */
  diagnostics: Diagnostic[];
  /** Details for --verbose, such as the layout chosen for each Mermaid flowchart. */
  notes: Note[];
  /** The effective options after merging config file, front matter and command line. */
  options: DocumentOptions;
  /** Config file that was applied, if any. */
  configFile?: string;
  /** Files the output depends on besides the Markdown (config file, stylesheets). */
  dependencies: string[];
}

export interface RenderedDocument extends Omit<ConvertResult, "output"> {
  html: string;
  title: string;
}

/** Starts one browser on first use and keeps it for later conversions. */
export class BrowserPool {
  private session?: Promise<BrowserSession>;

  constructor(
    private readonly executable?: string,
    /** Receives notes about the browser (which one started, sandbox fallback) for --verbose. */
    private readonly log?: (message: string) => void,
  ) {}

  get(): Promise<BrowserSession> {
    if (!this.session) {
      const executablePath = findBrowser(this.executable);
      this.log?.(`browser: ${executablePath}`);
      this.session = BrowserSession.open(executablePath, undefined, () =>
        this.log?.("browser: sandbox unavailable on this system, running without it"),
      );
    }
    // A failed start is not cached: the next conversion tries again.
    this.session.catch(() => (this.session = undefined));
    return this.session;
  }

  async close(): Promise<void> {
    const session = await this.session?.catch(() => undefined);
    this.session = undefined;
    await session?.close();
  }
}

function readStylesheet(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    throw new OptionsError(`stylesheet not found: ${file}`);
  }
}

function themeStylesheets(theme: string): string[] {
  const builtin = BUILTIN_THEMES.find((name) => name === theme);
  return builtin ? builtinThemeCss(builtin) : [readStylesheet(theme)];
}

/**
 * Chrome draws the header and footer inside the top and bottom margins. Measured: below about
 * 10 mm the header touches or overlaps the first line of text (and the footer the last line).
 */
export const MIN_HEADER_FOOTER_MARGIN = "10mm";

export function headerFooterSpaceWarnings(
  margin: Margins,
  hasHeader: boolean,
  hasFooter: boolean,
): Diagnostic[] {
  const minimum = lengthToPx(MIN_HEADER_FOOTER_MARGIN);
  const warnings: Diagnostic[] = [];
  // Half a pixel of slack: "0.39in" and "10mm" are the same margin once Chrome rounds them.
  if (hasHeader && lengthToPx(margin.top) < minimum - 0.5) {
    warnings.push({
      severity: "warning",
      message:
        `the header may overlap the text: top margin is ${margin.top}, ` +
        `at least ${MIN_HEADER_FOOTER_MARGIN} is needed (e.g. --margin-top 15mm)`,
    });
  }
  if (hasFooter && lengthToPx(margin.bottom) < minimum - 0.5) {
    warnings.push({
      severity: "warning",
      message:
        `the footer may overlap the text: bottom margin is ${margin.bottom}, ` +
        `at least ${MIN_HEADER_FOOTER_MARGIN} is needed ` +
        "(e.g. --margin-bottom 15mm, or --no-page-numbers for no footer)",
    });
  }
  return warnings;
}

/**
 * Justified text in the PDF: the body's paragraphs, those directly inside a quote or an alert,
 * and bulleted and numbered list items (the same ones markdown/hyphenate.ts gives soft hyphens).
 * Tables, footnotes, the title block, the table of contents and diagram labels stay aligned
 * left, as does code inside a list item. Print only: on screen the HTML keeps ragged lines.
 */
const JUSTIFY_CSS = `@media print {
  .markdown-body > p,
  .markdown-body > blockquote > p:not(.markdown-alert-title),
  .markdown-body > :is(ul, ol) li,
  .markdown-body > blockquote > :is(ul, ol) li {
    text-align: justify;
  }
  /* What list items may hold besides text keeps its own alignment. */
  .markdown-body li :is(pre, table) {
    text-align: start;
  }
}`;

/** Font size, if set, and the page's text height (used to fit images and diagrams). */
function layoutCss(options: DocumentOptions, margin: Margins): string {
  const height = contentHeightPx(options.pageSize, options.orientation === "landscape", margin);
  const family = FONT_FAMILIES[options.font];
  const rules = [
    `:root { --page-content-height: ${height}px; }`,
    `:root { --font-text: ${fontStack(options.font)}; ` +
      `--font-code: "JetBrains Mono", "${family}", "Inter", ui-monospace, monospace; }`,
  ];
  // Manrope's glyphs are taller than the headings' 1.25 line height (about 1.37 em). When a
  // heading is pushed to the next page, Chrome then repeats its text in the PDF bookmark.
  if (options.font === "manrope") rules.push("h1, h2, h3, h4, h5, h6 { line-height: 1.4; }");
  if (options.justify) rules.push(JUSTIFY_CSS);
  if (isAntigravityTheme(options.theme)) {
    rules.push(`:root { --ag-field-image: ${fieldImage(isDarkTheme(options.theme))}; }`);
  }
  if (options.fontSize) rules.push(`html { font-size: ${options.fontSize}; }`);
  return rules.join("\n");
}

/** The watermarks asked for (PDF only), sized to the page's text area. */
function watermarks(options: DocumentOptions, margin: Margins): string {
  const landscape = options.orientation === "landscape";
  return watermarkHtml({
    text: options.watermark,
    field: options.watermarkField,
    widthPx: textWidthPx(options.pageSize, landscape, margin),
    heightPx: contentHeightPx(options.pageSize, landscape, margin),
    dark: isDarkTheme(options.theme),
  });
}

export interface Note {
  line?: number;
  message: string;
}

const fixed2 = (n: number) => n.toFixed(2);

/** "Mermaid autofit: wrap 300, turned LR→TB, scale 0.33 → 1.00, height 81 → 903 px". */
export function describeLayout(layout: DiagramLayout): string {
  const changes = [
    layout.wrap === undefined ? undefined : `wrap ${layout.wrap}`,
    layout.turned ? `turned ${layout.turned}` : undefined,
  ].filter(Boolean);
  const scale = `scale ${fixed2(layout.baseScale)} → ${fixed2(layout.scale)}`;
  const height = `height ${layout.baseHeight} → ${layout.height} px`;
  return changes.length === 0
    ? `Mermaid autofit: kept as written (scale ${fixed2(layout.scale)}, ${layout.tried} layouts tried)`
    : `Mermaid autofit: ${changes.join(", ")}, ${scale}, ${height} (${layout.tried} layouts tried)`;
}

/** Mermaid theme: explicit choice, else dark diagrams for the dark page theme. */
export function effectiveMermaidTheme(options: DocumentOptions): MermaidTheme {
  if (options.mermaidTheme) return options.mermaidTheme;
  if (options.theme.startsWith("antigravity")) return "base";
  return isDarkTheme(options.theme) ? "dark" : "neutral";
}

/**
 * Render a Markdown file to a complete HTML document. A browser is only started (through
 * `browsers`) when the document has Mermaid diagrams.
 */
export async function renderDocument(
  inputPath: string,
  settings: RenderSettings,
  browsers: BrowserPool,
  /** Printed on pages (PDF): diagrams are fitted to the page height, not only the width. */
  paged = false,
): Promise<RenderedDocument> {
  const input = path.resolve(inputPath);
  const baseDir = path.dirname(input);

  const source = await readFile(input, "utf8");
  const frontMatter = extractFrontMatter(source, input);

  const configFile =
    settings.config === false
      ? undefined
      : settings.config
        ? path.resolve(settings.config)
        : findConfigFile(baseDir);
  const config = configFile ? readConfig(configFile) : { options: {}, warnings: [] };
  const options = mergeOptions(
    config.options,
    normalizeOptions(frontMatter.data, `${input} (front matter)`, baseDir),
    settings.overrides ?? {},
  );
  const margin = resolveMargins(options);
  const themeCss = themeStylesheets(options.theme);
  const extraCss = options.css.map(readStylesheet);

  const md = renderMarkdown(frontMatter.body, {
    baseDir,
    lang: options.lang,
    // Soft hyphens only where paragraphs are justified: in the PDF.
    hyphenate: paged && options.justify ? options.lang : undefined,
    figures: options.theme === "academic_basic",
  });
  const diagnostics: Diagnostic[] = [
    ...config.warnings.map((message) => ({ severity: "warning" as const, message })),
    ...md.diagnostics,
  ];
  const notes: Note[] = [];
  const title = options.title ?? md.title ?? path.parse(input).name;

  // Table of contents: at the [[toc]] marker, or at the start with --toc.
  let body = md.html;
  const toc = buildToc(md.headings, options.tocDepth, strings(options.lang).toc);
  if (md.hasTocMarker) {
    body = body.replace(tocPlaceholder(md.nonce), () => toc);
  } else if (options.toc) {
    body = toc + body;
  }

  // Mermaid needs a real DOM to lay out diagrams, also for HTML output.
  if (md.mermaid.length > 0) {
    const session = await browsers.get();
    const width = contentWidthPx(options.pageSize, options.orientation === "landscape", margin);
    const theme = effectiveMermaidTheme(options);
    const fontPx = fontSizePx(options.fontSize ?? DEFAULT_FONT_SIZE);
    const landscape = options.orientation === "landscape";
    const results = await renderMermaid(session, md.mermaid, {
      theme,
      widthPx: width,
      fontPx,
      // Same limit as the print stylesheet: the page's text height minus 6 mm.
      pageHeightPx: paged
        ? contentHeightPx(options.pageSize, landscape, margin) - lengthToPx("6mm")
        : Infinity,
      autofit: options.mermaidAutofit,
      flip: options.mermaidFlip,
      font: options.font,
      themeVariables: theme === "base" ? mermaidThemeVariables(options.theme) : undefined,
    });
    const filled = fillMermaid(body, md.nonce, md.mermaid, results);
    body = filled.html;
    diagnostics.push(...filled.diagnostics);
    md.mermaid.forEach((block, i) => {
      const result = results[i];
      if (!result || "error" in result) return;
      if (result.layout) notes.push({ line: block.line, message: describeLayout(result.layout) });
      if (paged && result.scale !== undefined && result.scale < SMALL_SCALE) {
        diagnostics.push({
          severity: "warning",
          line: block.line,
          message:
            `Mermaid diagram printed at ${Math.round(result.scale * 100)}% of its size; ` +
            "split it or shorten its labels to make it readable",
        });
      }
    });
  }

  const watermark = paged ? watermarks(options, margin) : "";
  const html = buildHtmlDocument({
    title,
    body,
    math: md.hasMath,
    lang: options.lang,
    subtitle: options.subtitle,
    author: options.author,
    date: options.date,
    kicker: options.kicker,
    affiliations: options.affiliations,
    abstract: options.abstract,
    keywords: options.keywords,
    showTitle: options.title !== undefined,
    themeCss,
    font: options.font,
    beforeBody: watermark || undefined,
    layoutCss: [
      ...densityCss(options.density),
      layoutCss(options, margin),
      ...(watermark ? [WATERMARK_CSS] : []),
    ],
    extraCss,
  });

  diagnostics.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  const dependencies = [
    ...(configFile ? [configFile] : []),
    ...(options.theme.endsWith(".css") ? [options.theme] : []),
    ...options.css,
  ];
  return { html, title, diagnostics, notes, options, configFile, dependencies };
}

/** Read a Markdown file and write it as a self-contained HTML document or a PDF. */
export async function convertFile(convert: ConvertOptions): Promise<ConvertResult> {
  const output = path.resolve(convert.output);
  const browsers = convert.browsers ?? new BrowserPool(convert.browser);

  try {
    const doc = await renderDocument(convert.input, convert, browsers, convert.format === "pdf");
    const { options } = doc;

    if (convert.format === "pdf") {
      const margin = resolveMargins(options);
      const author = options.author === undefined ? undefined : plainAuthor(options.author);
      const values = { title: doc.title, author, date: options.date };
      const footer = options.footer ?? (options.pageNumbers ? DEFAULT_FOOTER : undefined);
      const hasHeaderFooter = options.header !== undefined || footer !== undefined;
      doc.diagnostics.push(
        ...headerFooterSpaceWarnings(margin, options.header !== undefined, footer !== undefined),
      );
      const pageLook = headerFooterStyle(options.theme);
      const session = await browsers.get();
      const { pdf, blocked } = await session.printPdf(doc.html, {
        format: options.pageSize,
        landscape: options.orientation === "landscape",
        margin,
        headerTemplate: hasHeaderFooter
          ? headerFooterTemplate(options.header, values, margin, options.font, pageLook)
          : undefined,
        footerTemplate: hasHeaderFooter
          ? headerFooterTemplate(footer, values, margin, options.font, pageLook)
          : undefined,
        allowRemote: convert.allowRemote,
        softHyphensWidthPx: options.justify
          ? textWidthPx(options.pageSize, options.orientation === "landscape", margin)
          : undefined,
      });
      for (const url of blocked) {
        const hint = /^https?:/i.test(url) ? " (use --allow-remote to download it)" : "";
        doc.diagnostics.push({
          severity: "warning",
          message: `resource not loaded: ${url}${hint}`,
        });
      }
      await writeFileAtomic(output, pdf);
    } else {
      await writeFileAtomic(output, doc.html);
    }
    return {
      output,
      diagnostics: doc.diagnostics,
      notes: doc.notes,
      options,
      configFile: doc.configFile,
      dependencies: doc.dependencies,
    };
  } finally {
    if (!convert.browsers) await browsers.close();
  }
}

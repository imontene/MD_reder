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
  DEFAULT_FONT_SIZE,
  fontSizePx,
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
import { fillMermaid, renderMermaid } from "./render/mermaid.js";
import { contentHeightPx, contentWidthPx, lengthToPx } from "./render/page.js";
import { buildHtmlDocument, builtinThemeCss, densityCss } from "./render/template.js";
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
  return theme === "light" || theme === "dark" ? builtinThemeCss(theme) : [readStylesheet(theme)];
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

/** Font size, if set, and the page's text height (used to fit images and diagrams). */
function layoutCss(options: DocumentOptions, margin: Margins): string {
  const height = contentHeightPx(options.pageSize, options.orientation === "landscape", margin);
  const rules = [`:root { --page-content-height: ${height}px; }`];
  if (options.fontSize) rules.push(`html { font-size: ${options.fontSize}; }`);
  return rules.join("\n");
}

/** Mermaid theme: explicit choice, else dark diagrams for the dark page theme. */
export function effectiveMermaidTheme(options: DocumentOptions): MermaidTheme {
  return options.mermaidTheme ?? (options.theme === "dark" ? "dark" : "neutral");
}

/**
 * Render a Markdown file to a complete HTML document. A browser is only started (through
 * `browsers`) when the document has Mermaid diagrams.
 */
export async function renderDocument(
  inputPath: string,
  settings: RenderSettings,
  browsers: BrowserPool,
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

  const md = renderMarkdown(frontMatter.body, { baseDir, lang: options.lang });
  const diagnostics: Diagnostic[] = [
    ...config.warnings.map((message) => ({ severity: "warning" as const, message })),
    ...md.diagnostics,
  ];
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
    const results = await renderMermaid(session, md.mermaid, theme, width, fontPx);
    const filled = fillMermaid(body, md.nonce, md.mermaid, results);
    body = filled.html;
    diagnostics.push(...filled.diagnostics);
  }

  const html = buildHtmlDocument({
    title,
    body,
    math: md.hasMath,
    lang: options.lang,
    subtitle: options.subtitle,
    author: options.author,
    date: options.date,
    showTitle: options.title !== undefined,
    themeCss,
    layoutCss: [...densityCss(options.density), layoutCss(options, margin)],
    extraCss,
  });

  diagnostics.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  const dependencies = [
    ...(configFile ? [configFile] : []),
    ...(options.theme.endsWith(".css") ? [options.theme] : []),
    ...options.css,
  ];
  return { html, title, diagnostics, options, configFile, dependencies };
}

/** Read a Markdown file and write it as a self-contained HTML document or a PDF. */
export async function convertFile(convert: ConvertOptions): Promise<ConvertResult> {
  const output = path.resolve(convert.output);
  const browsers = convert.browsers ?? new BrowserPool(convert.browser);

  try {
    const doc = await renderDocument(convert.input, convert, browsers);
    const { options } = doc;

    if (convert.format === "pdf") {
      const margin = resolveMargins(options);
      const values = { title: doc.title, author: options.author, date: options.date };
      const footer = options.footer ?? (options.pageNumbers ? DEFAULT_FOOTER : undefined);
      const hasHeaderFooter = options.header !== undefined || footer !== undefined;
      doc.diagnostics.push(
        ...headerFooterSpaceWarnings(margin, options.header !== undefined, footer !== undefined),
      );
      const session = await browsers.get();
      const { pdf, blocked } = await session.printPdf(doc.html, {
        format: options.pageSize,
        landscape: options.orientation === "landscape",
        margin,
        headerTemplate: hasHeaderFooter
          ? headerFooterTemplate(options.header, values, margin)
          : undefined,
        footerTemplate: hasHeaderFooter ? headerFooterTemplate(footer, values, margin) : undefined,
        allowRemote: convert.allowRemote,
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
      options,
      configFile: doc.configFile,
      dependencies: doc.dependencies,
    };
  } finally {
    if (!convert.browsers) await browsers.close();
  }
}

import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { findBrowser } from "./browser/detect.js";
import { findConfigFile, loadConfig } from "./config.js";
import type { Diagnostic } from "./diagnostics.js";
import { extractFrontMatter } from "./frontmatter.js";
import { strings } from "./i18n.js";
import { renderMarkdown } from "./markdown/index.js";
import { buildToc, tocPlaceholder } from "./markdown/toc.js";
import {
  mergeOptions,
  normalizeOptions,
  OptionsError,
  parseMargin,
  type DocumentOptions,
  type MermaidTheme,
} from "./options.js";
import type { OutputFormat } from "./paths.js";
import { BrowserSession } from "./render/browser.js";
import { DEFAULT_FOOTER, headerFooterTemplate } from "./render/header-footer.js";
import { fillMermaid, renderMermaid } from "./render/mermaid.js";
import { contentWidthPx } from "./render/page.js";
import { buildHtmlDocument, builtinThemeCss } from "./render/template.js";

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

  constructor(private readonly executable?: string) {}

  get(): Promise<BrowserSession> {
    this.session ??= BrowserSession.open(findBrowser(this.executable));
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
  const options = mergeOptions(
    configFile ? loadConfig(configFile) : {},
    normalizeOptions(frontMatter.data, `${input} (front matter)`, baseDir),
    settings.overrides ?? {},
  );
  const margin = parseMargin(options.margin);
  const themeCss = themeStylesheets(options.theme);
  const extraCss = options.css.map(readStylesheet);

  const md = renderMarkdown(frontMatter.body, { baseDir, lang: options.lang });
  const diagnostics = [...md.diagnostics];
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
    const width = contentWidthPx(options.pageSize, options.landscape, margin);
    const theme = effectiveMermaidTheme(options);
    const results = await renderMermaid(session, md.mermaid, theme, width);
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

    await mkdir(path.dirname(output), { recursive: true });
    if (convert.format === "pdf") {
      const margin = parseMargin(options.margin);
      const values = { title: doc.title, author: options.author, date: options.date };
      const footer = options.footer ?? (options.pageNumbers ? DEFAULT_FOOTER : undefined);
      const hasHeaderFooter = options.header !== undefined || footer !== undefined;
      const session = await browsers.get();
      await session.printPdf(doc.html, {
        output,
        format: options.pageSize,
        landscape: options.landscape,
        margin,
        headerTemplate: hasHeaderFooter
          ? headerFooterTemplate(options.header, values, margin)
          : undefined,
        footerTemplate: hasHeaderFooter ? headerFooterTemplate(footer, values, margin) : undefined,
      });
    } else {
      await writeFile(output, doc.html, "utf8");
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

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
} from "./options.js";
import type { OutputFormat } from "./paths.js";
import { BrowserSession } from "./render/browser.js";
import { DEFAULT_FOOTER, headerFooterTemplate } from "./render/header-footer.js";
import { fillMermaid, renderMermaid } from "./render/mermaid.js";
import { contentWidthPx } from "./render/page.js";
import { buildHtmlDocument } from "./render/template.js";

export interface ConvertOptions {
  input: string;
  output: string;
  format: OutputFormat;
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

export interface ConvertResult {
  output: string;
  /** Problems found while rendering; the output is still written, with errors shown inline. */
  diagnostics: Diagnostic[];
  /** The effective options after merging config file, front matter and command line. */
  options: DocumentOptions;
  /** Config file that was applied, if any. */
  configFile?: string;
}

function readStylesheet(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    throw new OptionsError(`stylesheet not found: ${file}`);
  }
}

/** Read a Markdown file and write it as a self-contained HTML document or a PDF. */
export async function convertFile(convert: ConvertOptions): Promise<ConvertResult> {
  const input = path.resolve(convert.input);
  const output = path.resolve(convert.output);
  const baseDir = path.dirname(input);

  const source = await readFile(input, "utf8");
  const frontMatter = extractFrontMatter(source, input);

  const configFile =
    convert.config === false
      ? undefined
      : convert.config
        ? path.resolve(convert.config)
        : findConfigFile(baseDir);
  const options = mergeOptions(
    configFile ? loadConfig(configFile) : {},
    normalizeOptions(frontMatter.data, `${input} (front matter)`, baseDir),
    convert.overrides ?? {},
  );
  const margin = parseMargin(options.margin);
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

  // A browser is needed to print PDFs and to lay out Mermaid diagrams (also for HTML output).
  const needsBrowser = convert.format === "pdf" || md.mermaid.length > 0;
  const session = needsBrowser
    ? await BrowserSession.open(findBrowser(convert.browser))
    : undefined;

  try {
    if (session && md.mermaid.length > 0) {
      const width = contentWidthPx(options.pageSize, options.landscape, margin);
      const results = await renderMermaid(session, md.mermaid, options.mermaidTheme, width);
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
      extraCss,
    });

    await mkdir(path.dirname(output), { recursive: true });
    if (convert.format === "pdf") {
      const values = { title, author: options.author, date: options.date };
      const footer = options.footer ?? (options.pageNumbers ? DEFAULT_FOOTER : undefined);
      const hasHeaderFooter = options.header !== undefined || footer !== undefined;
      await session!.printPdf(html, {
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
      await writeFile(output, html, "utf8");
    }
  } finally {
    await session?.close();
  }

  diagnostics.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { output, diagnostics, options, configFile };
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { findBrowser } from "./browser/detect.js";
import type { Diagnostic } from "./diagnostics.js";
import { renderMarkdown } from "./markdown/index.js";
import type { OutputFormat } from "./paths.js";
import { BrowserSession } from "./render/browser.js";
import { fillMermaid, renderMermaid, type MermaidTheme } from "./render/mermaid.js";
import { buildHtmlDocument } from "./render/template.js";

export interface ConvertOptions {
  input: string;
  output: string;
  format: OutputFormat;
  /** Explicit browser executable. */
  browser?: string;
  mermaidTheme?: MermaidTheme;
}

export interface ConvertResult {
  output: string;
  /** Problems found while rendering; the output is still written, with errors shown inline. */
  diagnostics: Diagnostic[];
}

/** Read a Markdown file and write it as a self-contained HTML document or a PDF. */
export async function convertFile(options: ConvertOptions): Promise<ConvertResult> {
  const input = path.resolve(options.input);
  const output = path.resolve(options.output);

  const source = await readFile(input, "utf8");
  const md = renderMarkdown(source, { baseDir: path.dirname(input) });
  const diagnostics = [...md.diagnostics];

  // A browser is needed to print PDFs and to lay out Mermaid diagrams (also for HTML output).
  const needsBrowser = options.format === "pdf" || md.mermaid.length > 0;
  const session = needsBrowser
    ? await BrowserSession.open(findBrowser(options.browser))
    : undefined;

  try {
    let body = md.html;
    if (session && md.mermaid.length > 0) {
      const results = await renderMermaid(session, md.mermaid, options.mermaidTheme);
      const filled = fillMermaid(body, md.nonce, md.mermaid, results);
      body = filled.html;
      diagnostics.push(...filled.diagnostics);
    }

    const html = buildHtmlDocument({
      title: md.title ?? path.parse(input).name,
      body,
      math: md.hasMath,
    });

    await mkdir(path.dirname(output), { recursive: true });
    if (options.format === "pdf") {
      await session!.printPdf(html, { output });
    } else {
      await writeFile(output, html, "utf8");
    }
  } finally {
    await session?.close();
  }

  diagnostics.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { output, diagnostics };
}

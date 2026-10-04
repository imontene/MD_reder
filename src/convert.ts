import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { findBrowser } from "./browser/detect.js";
import { renderMarkdown } from "./markdown/index.js";
import type { OutputFormat } from "./paths.js";
import { htmlToPdf } from "./render/pdf.js";
import { buildHtmlDocument } from "./render/template.js";

export interface ConvertOptions {
  input: string;
  output: string;
  format: OutputFormat;
  /** Explicit browser executable (PDF only). */
  browser?: string;
}

export interface ConvertResult {
  output: string;
  warnings: string[];
}

/** Read a Markdown file and write it as a self-contained HTML document or a PDF. */
export async function convertFile(options: ConvertOptions): Promise<ConvertResult> {
  const input = path.resolve(options.input);
  const output = path.resolve(options.output);

  // Resolve the browser first so a missing browser fails fast, before any work.
  const executablePath = options.format === "pdf" ? findBrowser(options.browser) : undefined;

  const source = await readFile(input, "utf8");
  const { html: body, title, warnings } = renderMarkdown(source, { baseDir: path.dirname(input) });
  const html = buildHtmlDocument({ title: title ?? path.parse(input).name, body });

  await mkdir(path.dirname(output), { recursive: true });
  if (executablePath) {
    await htmlToPdf(html, { executablePath, output });
  } else {
    await writeFile(output, html, "utf8");
  }
  return { output, warnings };
}

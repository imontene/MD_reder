import markdownIt, { type MarkdownIt } from "markdown-it";
import anchor from "markdown-it-anchor";
import { inlineLocalImages, type ImageEnv } from "./images.js";
import { taskLists } from "./task-lists.js";

export interface MarkdownResult {
  /** HTML fragment for the document body. */
  html: string;
  /** Text of the first level-1 heading, if any. */
  title?: string;
  warnings: string[];
}

export interface MarkdownOptions {
  /** Directory used to resolve relative image paths. Defaults to the current directory. */
  baseDir?: string;
}

export function createMarkdown(): MarkdownIt {
  const md = markdownIt({ html: true, linkify: true, typographer: false });
  md.use(anchor, { tabIndex: false });
  md.use(taskLists);
  md.use(inlineLocalImages);
  return md;
}

let shared: MarkdownIt | undefined;

export function renderMarkdown(source: string, options: MarkdownOptions = {}): MarkdownResult {
  const md = (shared ??= createMarkdown());
  const env: ImageEnv = { baseDir: options.baseDir ?? process.cwd(), warnings: [] };
  const tokens = md.parse(source, env);

  let title: string | undefined;
  const h1 = tokens.findIndex((t) => t.type === "heading_open" && t.tag === "h1");
  if (h1 !== -1) {
    title = tokens[h1 + 1]?.children
      ?.filter((t) => t.type === "text" || t.type === "code_inline")
      .map((t) => t.content)
      .join("")
      .trim();
  }

  const html = md.renderer.render(tokens, md.options, env);
  return { html, title: title || undefined, warnings: env.warnings };
}

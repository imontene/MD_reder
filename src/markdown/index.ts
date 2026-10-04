import { randomBytes } from "node:crypto";
import markdownIt, { type MarkdownIt } from "markdown-it";
import anchor from "markdown-it-anchor";
import type { Diagnostic } from "../diagnostics.js";
import { inlineChildLines, type MermaidBlock, type RenderEnv } from "./env.js";
import { inlineLocalImages } from "./images.js";
import { math } from "./math.js";
import { mermaid } from "./mermaid.js";
import { taskLists } from "./task-lists.js";

export interface MarkdownResult {
  /** HTML fragment for the document body; Mermaid diagrams are still placeholders. */
  html: string;
  /** Text of the first level-1 heading, if any. */
  title?: string;
  diagnostics: Diagnostic[];
  /** Mermaid sources, in document order, to render with `fillMermaid`. */
  mermaid: MermaidBlock[];
  /** Token identifying this render's Mermaid placeholders. */
  nonce: string;
  hasMath: boolean;
}

export interface MarkdownOptions {
  /** Directory used to resolve relative image paths. Defaults to the current directory. */
  baseDir?: string;
}

export function createMarkdown(): MarkdownIt {
  const md = markdownIt({ html: true, linkify: true, typographer: false });
  md.use(anchor, { tabIndex: false });
  md.use(taskLists);
  md.use(inlineChildLines);
  md.use(inlineLocalImages);
  md.use(math);
  md.use(mermaid);
  return md;
}

let shared: MarkdownIt | undefined;

export function renderMarkdown(source: string, options: MarkdownOptions = {}): MarkdownResult {
  const md = (shared ??= createMarkdown());
  const env: RenderEnv = {
    baseDir: options.baseDir ?? process.cwd(),
    diagnostics: [],
    mermaid: [],
    nonce: randomBytes(8).toString("hex"),
    macros: {},
    hasMath: false,
  };
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
  return {
    html,
    title: title || undefined,
    diagnostics: env.diagnostics,
    mermaid: env.mermaid,
    nonce: env.nonce,
    hasMath: env.hasMath,
  };
}

import type { Env, MarkdownIt, Token } from "markdown-it";
import type { Diagnostic } from "../diagnostics.js";

export interface MermaidBlock {
  source: string;
  /** 1-based source line of the opening fence. */
  line?: number;
}

/** Per-document state shared by the Markdown plugins during one render. */
export interface RenderEnv extends Env {
  /** Directory that relative image paths are resolved against (the .md file's folder). */
  baseDir: string;
  diagnostics: Diagnostic[];
  /** Mermaid diagrams found in the document, rendered later in a browser. */
  mermaid: MermaidBlock[];
  /** Random token that makes Mermaid placeholders impossible to forge from Markdown. */
  nonce: string;
  /** KaTeX macros, shared by every formula so `\newcommand`/`\def` work across the document. */
  macros: Record<string, string | object>;
  /** Set when the document contains at least one formula. */
  hasMath: boolean;
}

/** 1-based line of a token, from markdown-it's 0-based `[start, end)` line map. */
export function tokenLine(token: Token): number | undefined {
  return token.map ? token.map[0] + 1 : undefined;
}

/** Copy each inline token's line map to its children so inline errors can report a line. */
export function inlineChildLines(md: MarkdownIt): void {
  md.core.ruler.push("inline_child_lines", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "inline" || !token.map) continue;
      for (const child of token.children ?? []) child.map ??= token.map;
    }
  });
}

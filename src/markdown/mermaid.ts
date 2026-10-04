import type { MarkdownIt } from "markdown-it";
import { tokenLine, type RenderEnv } from "./env.js";

/** Placeholder left in the HTML for diagram `index`; replaced once the browser renders it. */
export function mermaidPlaceholder(nonce: string, index: number): string {
  return `<!--mermaid:${nonce}:${index}-->`;
}

/**
 * ```` ```mermaid ```` fences are collected into `env.mermaid` and replaced by a placeholder.
 * Rendering needs a real DOM, so it happens later in the browser (see render/mermaid.ts).
 */
export function mermaid(md: MarkdownIt): void {
  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, rawEnv, self) => {
    const token = tokens[idx]!;
    if (token.info.trim().toLowerCase() !== "mermaid") {
      return fence(tokens, idx, options, rawEnv, self);
    }
    const env = rawEnv as RenderEnv;
    const index = env.mermaid.push({ source: token.content, line: tokenLine(token) }) - 1;
    return `<figure class="mermaid-diagram">${mermaidPlaceholder(env.nonce, index)}</figure>\n`;
  };
}

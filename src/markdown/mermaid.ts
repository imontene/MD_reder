import type { MarkdownIt, Token } from "markdown-it";
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
    const block = { source: token.content, line: tokenLine(token) };
    const afterHeading = (token.meta as { afterHeading?: boolean } | null)?.afterHeading;
    const index = env.mermaid.push(afterHeading ? { ...block, afterHeading } : block) - 1;
    // A caption paragraph moved here by captions.ts goes under the diagram.
    const caption = (token.meta as { caption?: Token } | null)?.caption;
    const figcaption = caption
      ? `\n<figcaption>${self.renderInline(caption.children ?? [], options, rawEnv)}</figcaption>`
      : "";
    return `<figure class="mermaid-diagram">${mermaidPlaceholder(env.nonce, index)}${figcaption}</figure>\n`;
  };
}

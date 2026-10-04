import type { MarkdownIt, Token } from "markdown-it";
import { escapeHtml } from "../html.js";
import type { RenderEnv } from "./env.js";

export interface Heading {
  level: number;
  id: string;
  /** Heading content as HTML (text, inline code and math), without links. */
  html: string;
}

const MARKER = /^\[\[?toc\]?\]$/i;

/** Placeholder for the table of contents, filled in after rendering. */
export function tocPlaceholder(nonce: string): string {
  return `<!--toc:${nonce}-->`;
}

/**
 * A paragraph containing only `[[toc]]` or `[toc]` marks where the table of contents goes.
 * Without a marker, `--toc` puts it at the start of the document.
 */
export function tocMarker(md: MarkdownIt): void {
  md.block.ruler.before("paragraph", "toc_marker", (state, startLine, _endLine, silent) => {
    const start = state.bMarks[startLine]! + state.tShift[startLine]!;
    const line = state.src.slice(start, state.eMarks[startLine]!).trim();
    if (!MARKER.test(line)) return false;
    if (!silent) {
      const token = state.push("toc_marker", "", 0);
      token.map = [startLine, startLine + 1];
      state.line = startLine + 1;
    }
    return true;
  });
  md.renderer.rules.toc_marker = (_tokens, _idx, _options, env) => {
    const renderEnv = env as RenderEnv;
    renderEnv.hasTocMarker = true;
    return tocPlaceholder(renderEnv.nonce) + "\n";
  };
}

/** Collect headings (with the ids set by markdown-it-anchor) from parsed tokens. */
export function collectHeadings(md: MarkdownIt, tokens: Token[], env: RenderEnv): Heading[] {
  const headings: Heading[] = [];
  tokens.forEach((token, i) => {
    if (token.type !== "heading_open") return;
    const id = token.attrGet("id");
    const inline = tokens[i + 1];
    if (!id || !inline?.children) return;

    const html = inline.children
      .map((child) => {
        switch (child.type) {
          case "text":
            return escapeHtml(child.content);
          case "code_inline":
            return `<code>${escapeHtml(child.content)}</code>`;
          case "math_inline":
          case "softbreak":
            return md.renderer.renderInline([child], md.options, env);
          default:
            return "";
        }
      })
      .join("")
      .trim();
    headings.push({ level: Number(token.tag.slice(1)), id: String(id), html });
  });
  return headings;
}

interface TocNode {
  heading?: Heading;
  children: TocNode[];
}

function renderNodes(nodes: TocNode[]): string {
  const items = nodes.map((node) => {
    const link = node.heading
      ? `<a href="#${escapeHtml(node.heading.id)}">${node.heading.html}</a>`
      : "";
    return `<li>${link}${node.children.length ? renderNodes(node.children) : ""}</li>`;
  });
  return `<ul>${items.join("")}</ul>`;
}

/**
 * Nested list of links to the headings up to `depth`. A single level-1 heading is the document
 * title and is left out. Skipped levels (h2 → h4) nest under an empty item.
 */
export function buildToc(headings: Heading[], depth: number, title: string): string {
  let items = headings.filter((h) => h.level <= depth);
  if (headings.filter((h) => h.level === 1).length === 1) items = items.filter((h) => h.level > 1);
  if (items.length === 0) return "";

  const base = Math.min(...items.map((h) => h.level));
  const root: TocNode = { children: [] };
  // stack[k] is the node whose children hold level base + k.
  const stack: TocNode[] = [root];
  for (const heading of items) {
    const depthIndex = heading.level - base;
    stack.length = Math.min(stack.length, depthIndex + 1);
    while (stack.length <= depthIndex) {
      const parent = stack[stack.length - 1]!;
      let last = parent.children[parent.children.length - 1];
      if (!last) {
        last = { children: [] };
        parent.children.push(last);
      }
      stack.push(last);
    }
    const node: TocNode = { heading, children: [] };
    stack[depthIndex]!.children.push(node);
    stack.push(node);
  }
  return `<nav class="toc"><p class="toc-title">${escapeHtml(title)}</p>\n${renderNodes(root.children)}\n</nav>\n`;
}

import katex from "katex";
import type { MarkdownIt, StateBlock, StateInline, Token } from "markdown-it";
import { escapeHtml } from "../html.js";
import { tokenLine, type RenderEnv } from "./env.js";

const DOLLAR = 0x24;
const BACKSLASH = 0x5c;

const isWhitespace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isDigit = (ch: string | undefined) => ch !== undefined && ch >= "0" && ch <= "9";

/** Index of the next `$` (or `$$`) at or after `from` that is not backslash-escaped, or -1. */
function findClosing(src: string, from: number, delimiter: string): number {
  for (let i = from; i < src.length; i++) {
    if (src.charCodeAt(i) === BACKSLASH) {
      i++;
      continue;
    }
    if (src.startsWith(delimiter, i)) return i;
  }
  return -1;
}

/**
 * Inline math: `$...$` and `$$...$$` inside a paragraph.
 *
 * Follows Pandoc's rules so prices like "$5 and $10" stay text: the opening `$` must not be
 * followed by whitespace, and the closing `$` must not be preceded by whitespace nor followed by
 * a digit.
 */
function mathInline(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== DOLLAR) return false;

  const display = src.charCodeAt(pos + 1) === DOLLAR;
  const delimiter = display ? "$$" : "$";
  const start = pos + delimiter.length;

  if (!display && isWhitespace(src[start])) return false;

  const end = findClosing(src, start, delimiter);
  if (end === -1 || end === start) return false;
  if (!display && (isWhitespace(src[end - 1]) || isDigit(src[end + 1]))) return false;

  if (!silent) {
    const token = state.push(display ? "math_inline_display" : "math_inline", "math", 0);
    token.content = src.slice(start, end);
    token.markup = delimiter;
  }
  state.pos = end + delimiter.length;
  return true;
}

/** Block math: a paragraph opened by `$$`, on one line (`$$ x $$`) or spanning several. */
function mathBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  let pos = state.bMarks[startLine]! + state.tShift[startLine]!;
  let max = state.eMarks[startLine]!;
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
  if (!state.src.startsWith("$$", pos)) return false;

  pos += 2;
  let firstLine = state.src.slice(pos, max);
  let lastLine = "";
  let nextLine = startLine;
  let found = false;

  if (firstLine.trim().endsWith("$$")) {
    // Single line: $$ ... $$
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  } else {
    while (++nextLine < endLine) {
      pos = state.bMarks[nextLine]! + state.tShift[nextLine]!;
      max = state.eMarks[nextLine]!;
      if (pos < max && state.sCount[nextLine]! < state.blkIndent) break;
      const text = state.src.slice(pos, max).trimEnd();
      if (text.endsWith("$$")) {
        lastLine = text.slice(0, -2);
        found = true;
        break;
      }
    }
  }
  if (!found) return false;
  if (silent) return true;

  const body =
    nextLine === startLine
      ? firstLine
      : [
          firstLine,
          state.getLines(startLine + 1, nextLine, state.tShift[startLine]!, false),
          lastLine,
        ].join("\n");

  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content = body.trim();
  token.map = [startLine, nextLine + 1];
  token.markup = "$$";
  state.line = nextLine + 1;
  return true;
}

/** Render TeX with KaTeX; on failure record an error and show the source highlighted instead. */
export function renderTex(tex: string, displayMode: boolean, env: RenderEnv, token: Token): string {
  env.hasMath = true;
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: true,
      output: "html",
      strict: "ignore",
      trust: false,
      globalGroup: true,
      macros: env.macros,
    });
  } catch (error) {
    const message = error instanceof katex.ParseError ? error.rawMessage : String(error);
    env.diagnostics.push({
      severity: "error",
      message: `LaTeX: ${message}`,
      line: tokenLine(token),
    });
    const tag = displayMode ? "div" : "span";
    return `<${tag} class="math-error" title="${escapeHtml(message)}">${escapeHtml(tex)}</${tag}>`;
  }
}

/**
 * LaTeX math rendered at build time with KaTeX (no JavaScript needed in the output):
 * `$inline$`, `$$display$$` blocks and ```` ```math ```` fences (GitHub syntax).
 */
export function math(md: MarkdownIt): void {
  md.inline.ruler.after("escape", "math_inline", mathInline);
  md.block.ruler.before("fence", "math_block", mathBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });

  const rules = md.renderer.rules;
  rules.math_inline = (tokens, idx, _options, env) =>
    renderTex(tokens[idx]!.content, false, env as RenderEnv, tokens[idx]!);
  rules.math_inline_display = (tokens, idx, _options, env) =>
    renderTex(tokens[idx]!.content, true, env as RenderEnv, tokens[idx]!);
  rules.math_block = (tokens, idx, _options, env) =>
    `<div class="math-display">${renderTex(tokens[idx]!.content, true, env as RenderEnv, tokens[idx]!)}</div>\n`;

  const fence = rules.fence!;
  rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    if (token.info.trim().toLowerCase() === "math") {
      return `<div class="math-display">${renderTex(token.content, true, env as RenderEnv, token)}</div>\n`;
    }
    return fence(tokens, idx, options, env, self);
  };
}

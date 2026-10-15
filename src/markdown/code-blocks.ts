import type { MarkdownIt } from "markdown-it";

/**
 * Code blocks up to this many lines are kept on one page; longer ones may break across pages
 * (the theme keeps at least a few lines on each side), so a long listing does not push itself
 * to the next page and leave a large gap behind.
 */
export const SHORT_CODE_LINES = 12;

const KEEP_CLASS = "keep-together";

function markShort(html: string, content: string): string {
  const lines = content.replace(/\n$/, "").split("\n").length;
  if (lines > SHORT_CODE_LINES || !html.startsWith("<pre")) return html;
  return html.replace(/^<pre(?: class="([^"]*)")?/, (_m, classes?: string) =>
    classes ? `<pre class="${classes} ${KEEP_CLASS}"` : `<pre class="${KEEP_CLASS}"`,
  );
}

/** Mark short fenced and indented code blocks with `keep-together` (see SHORT_CODE_LINES). */
export function codeBlocks(md: MarkdownIt): void {
  for (const rule of ["fence", "code_block"] as const) {
    const render = md.renderer.rules[rule]!;
    md.renderer.rules[rule] = (tokens, idx, options, env, self) =>
      markShort(render(tokens, idx, options, env, self), tokens[idx]!.content);
  }
}

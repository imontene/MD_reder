import type { MarkdownIt, Token } from "markdown-it";
import { DEFAULT_LANG, strings, type AlertType } from "../i18n.js";

const MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*$/i;

/**
 * GitHub alerts: a blockquote whose first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
 * `[!WARNING]` or `[!CAUTION]` becomes a styled callout with a title.
 */
export function alerts(md: MarkdownIt): void {
  md.core.ruler.after("inline", "github_alerts", (state) => {
    const tokens = state.tokens;
    const titles = strings((state.env as { lang?: string }).lang ?? DEFAULT_LANG).alerts;

    for (let i = 0; i + 2 < tokens.length; i++) {
      const open = tokens[i]!;
      const inline = tokens[i + 2]!;
      if (open.type !== "blockquote_open" || tokens[i + 1]!.type !== "paragraph_open") continue;
      const first = inline.children?.[0];
      const match = first?.type === "text" ? MARKER.exec(first.content) : null;
      if (!match) continue;

      const type = match[1]!.toLowerCase() as AlertType;
      open.attrJoin("class", `markdown-alert markdown-alert-${type}`);

      // Drop the marker (and the line break after it); drop the paragraph if nothing is left.
      const children = inline.children!;
      children.splice(0, children[1]?.type === "softbreak" ? 2 : 1);
      inline.content = inline.content.replace(/^[^\n]*\n?/, "");
      if (children.length === 0) {
        tokens.splice(i + 1, 3);
      }

      const title = new state.Token("html_block", "", 0) as Token;
      title.content = `<p class="markdown-alert-title">${titles[type]}</p>\n`;
      tokens.splice(i + 1, 0, title);
    }
  });
}

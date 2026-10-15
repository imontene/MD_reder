import type { MarkdownIt, Token } from "markdown-it";

export const KEEP_WITH_HEADING_CLASS = "keep-with-heading";

const isMermaidFence = (token: Token | undefined) =>
  token?.type === "fence" && token.info.trim().toLowerCase() === "mermaid";

/** A paragraph holding nothing but one image (`![alt](img.png)`). */
function imageParagraphEnd(tokens: Token[], i: number): number | undefined {
  if (tokens[i]?.type !== "paragraph_open" || tokens[i + 2]?.type !== "paragraph_close") {
    return undefined;
  }
  const children = tokens[i + 1]?.children?.filter(
    (child) => !(child.type === "text" && child.content.trim() === ""),
  );
  return children?.length === 1 && children[0]!.type === "image" ? i + 2 : undefined;
}

/**
 * Wrap a top-level heading and the diagram or lone image right after it in a block that is not
 * split across pages (`.keep-with-heading` in theme.css). Otherwise a figure that does not fit at
 * the bottom of a page moves to the next one and leaves its heading alone at the bottom.
 */
export function keepWithHeading(md: MarkdownIt): void {
  md.core.ruler.push("keep_with_heading", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i]!;
      if (open.type !== "heading_open" || open.level !== 0) continue;
      const next = i + 3; // heading_open, inline, heading_close
      let end: number | undefined;
      if (isMermaidFence(tokens[next])) {
        end = next;
        tokens[next]!.meta = { ...tokens[next]!.meta, afterHeading: true };
      } else {
        end = imageParagraphEnd(tokens, next);
      }
      if (end === undefined) continue;

      const before = new state.Token("html_block", "", 0);
      before.content = `<div class="${KEEP_WITH_HEADING_CLASS}">\n`;
      const after = new state.Token("html_block", "", 0);
      after.content = "</div>\n";
      tokens.splice(end + 1, 0, after);
      tokens.splice(i, 0, before);
      i = end + 2;
    }
  });
}

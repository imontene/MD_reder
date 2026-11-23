import type { MarkdownIt, Token } from "markdown-it";
import type { RenderEnv } from "./env.js";

const MARKER = /^\[\[backmatter\]\]$/i;

/** Titles of a list of references. */
const REFERENCES =
  /^(referencias|references|bibliograf[ií]a|bibliography|r[ée]f[ée]rences|literatur|literaturverzeichnis|refer[êe]ncias)$/i;

/** Class of the numbered list of a "References" section ("[1]" in the preprint theme). */
export const REFERENCES_CLASS = "references";

/** How section numbers are written: "1", "1.1" or, dotted, "1.", "1.1.". */
export type SectionNumbering = "plain" | "dotted";

/** Class of the number put before a numbered heading. */
export const SECTION_NUMBER_CLASS = "secnum";

/**
 * Sections of a paper:
 *
 * - A line holding only `[[backmatter]]` opens the back matter (contributions, funding,
 *   references…): what follows it, to the end, goes in `<div class="backmatter">`.
 * - With `env.numberSections`, top-level `##` and `###` headings before the back matter get
 *   their number ("2", "2.1") as a real `<span class="secnum">`, so that it also shows in the
 *   table of contents and the PDF bookmarks. Deeper headings are not numbered.
 * - A numbered list in a section titled "Referencias" (References, Bibliografía…) is the list of
 *   references: it gets the class "references", and that title is not numbered.
 */
const headingText = (inline: Token | undefined): string =>
  (inline?.children ?? [])
    .filter((child) => child.type === "text" || child.type === "code_inline")
    .map((child) => child.content)
    .join("")
    .trim();

export function sections(md: MarkdownIt): void {
  md.block.ruler.before("paragraph", "backmatter_marker", (state, startLine, _endLine, silent) => {
    const start = state.bMarks[startLine]! + state.tShift[startLine]!;
    const line = state.src.slice(start, state.eMarks[startLine]!).trim();
    if (state.level !== 0 || !MARKER.test(line)) return false;
    if (!silent) {
      const token = state.push("backmatter_open", "div", 1);
      token.map = [startLine, startLine + 1];
      token.attrSet("class", "backmatter");
      state.line = startLine + 1;
    }
    return true;
  });

  md.core.ruler.push("sections", (state) => {
    const env = state.env as RenderEnv;
    const tokens = state.tokens;
    const marker = tokens.findIndex((token) => token.type === "backmatter_open");
    if (marker !== -1) tokens.push(new state.Token("backmatter_close", "div", -1));

    // Ordered lists under a "References" heading, up to the next heading of that level or above.
    const referenceHeadings = new Set<Token>();
    let inReferences = false;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (token.type === "heading_open" && token.level === 0 && /^h[1-3]$/.test(token.tag)) {
        inReferences = REFERENCES.test(headingText(tokens[i + 1]));
        if (inReferences) referenceHeadings.add(token);
      } else if (inReferences && token.type === "ordered_list_open" && token.level === 0) {
        token.attrJoin("class", REFERENCES_CLASS);
      }
    }
    if (!env.numberSections) return;

    const counts = [0, 0];
    const end = marker === -1 ? tokens.length : marker;
    for (let i = 0; i < end; i++) {
      const open = tokens[i]!;
      if (open.type !== "heading_open" || open.level !== 0) continue;
      const depth = open.tag === "h2" ? 0 : open.tag === "h3" ? 1 : -1;
      if (depth === -1 || referenceHeadings.has(open)) continue;
      counts[depth]!++;
      if (depth === 0) counts[1] = 0;
      const parts = depth === 0 ? [counts[0]] : [counts[0], counts[1]];
      const number = parts.join(".") + (env.numberSections === "dotted" ? "." : "");
      const inline = tokens[i + 1];
      if (!inline?.children) continue;
      const span: Token = new state.Token("html_inline", "", 0);
      span.content = `<span class="${SECTION_NUMBER_CLASS}">${number}</span> `;
      span.meta = { sectionNumber: number };
      inline.children.unshift(span);
    }
  });
}

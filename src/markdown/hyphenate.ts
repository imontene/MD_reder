import type { MarkdownIt, Token } from "markdown-it";
import createHyphenator from "hyphen";
import de from "hyphen/patterns/de-1996.js";
import enGb from "hyphen/patterns/en-gb.js";
import enUs from "hyphen/patterns/en-us.js";
import es from "hyphen/patterns/es.js";
import fr from "hyphen/patterns/fr.js";
import it from "hyphen/patterns/it.js";
import pt from "hyphen/patterns/pt.js";
import type { RenderEnv } from "./env.js";

/**
 * Soft hyphens (U+00AD) for justified paragraphs in the PDF, so the browser can break long
 * words at the end of a line instead of stretching the spaces. They are inserted here, from TeX
 * hyphenation patterns, because CSS `hyphens: auto` depends on dictionaries that Chromium and
 * Chrome Headless Shell do not ship. When printing, the soft hyphens that did not end up at the
 * end of a line are removed again (render/browser.ts), so they stay out of the PDF's text.
 */

export const SOFT_HYPHEN = "­";

type Patterns = Parameters<typeof createHyphenator>[0];

/** Hyphenation patterns by language: base language, or language-region where they differ. */
const PATTERNS: Record<string, Patterns> = {
  es,
  en: enUs,
  "en-gb": enGb,
  pt,
  fr,
  de,
  it,
};

export const HYPHENATION_LANGUAGES = Object.keys(PATTERNS);

const hyphenators = new Map<Patterns, (text: string) => string>();

/** Hyphenation function for a BCP 47 language tag ("es", "es-CL", "en-GB"), if supported. */
export function hyphenatorFor(lang: string): ((text: string) => string) | undefined {
  const tag = lang.trim().toLowerCase().replace(/_/g, "-");
  const patterns = PATTERNS[tag.split("-").slice(0, 2).join("-")] ?? PATTERNS[tag.split("-")[0]!];
  if (!patterns) return undefined;
  let hyphenate = hyphenators.get(patterns);
  if (!hyphenate) {
    // The input is plain text from Markdown, not HTML (a literal "<" is just a character).
    const sync = createHyphenator(patterns, { html: false }) as (text: string) => string;
    hyphenate = (text) => sync(text);
    hyphenators.set(patterns, hyphenate);
  }
  return hyphenate;
}

/**
 * Whether a paragraph is justified (the same paragraphs as the print stylesheet in convert.ts):
 * top-level, directly inside a blockquote or alert, or in a bulleted or numbered list item
 * (nested lists too). Footnotes and tables are not.
 */
function justified(containers: string[]): boolean {
  // Bulleted and numbered lists (nested too) are justified like the text around them.
  const blocks = containers.filter((c) => !LIST_CONTAINERS.has(c));
  return blocks.length === 0 || (blocks.length === 1 && blocks[0] === "blockquote_open");
}

const LIST_CONTAINERS = new Set(["bullet_list_open", "ordered_list_open", "list_item_open"]);

function hyphenateInline(inline: Token, hyphenate: (text: string) => string): void {
  let inAutolink = 0;
  for (const child of inline.children ?? []) {
    if (child.type === "link_open" && (child.markup === "linkify" || child.markup === "autolink")) {
      inAutolink++;
    } else if (child.type === "link_close" && inAutolink > 0) {
      inAutolink--;
    } else if (child.type === "text" && inAutolink === 0) {
      child.content = hyphenate(child.content);
    }
  }
}

/** Insert soft hyphens in the paragraphs that are justified in the PDF (env.hyphenate). */
export function hyphenation(md: MarkdownIt): void {
  md.core.ruler.push("hyphenation", (state) => {
    const lang = (state.env as RenderEnv).hyphenate;
    const hyphenate = lang === undefined ? undefined : hyphenatorFor(lang);
    if (!hyphenate) return;

    const containers: string[] = [];
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]!;
      if (token.type === "paragraph_open") {
        const inline = state.tokens[i + 1];
        if (justified(containers) && inline?.type === "inline") hyphenateInline(inline, hyphenate);
      } else if (token.type === "paragraph_close") {
        continue;
      } else if (token.nesting === 1) {
        containers.push(token.type);
      } else if (token.nesting === -1) {
        containers.pop();
      }
    }
  });
}

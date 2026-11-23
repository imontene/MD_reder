import { readTextAsset } from "../assets.js";
import { escapeHtml } from "../html.js";
import { DEFAULT_LANG, strings } from "../i18n.js";
import {
  fontFaceCss,
  magazineFontFaceCss,
  openAccessFontFaceCss,
  preprintFontFaceCss,
  serifFontFaceCss,
} from "./fonts.js";
import { isMagazineTheme, type Author, type BuiltinTheme, type TextFont } from "../options.js";
import { authorsHtml } from "./authors.js";
import { katexCss } from "./katex.js";
import { version } from "../version.js";

export { escapeHtml };

const builtinCss = new Map<string, string>();

function asset(name: string): string {
  let css = builtinCss.get(name);
  if (css === undefined) {
    css = readTextAsset(`mdrender/assets/${name}`);
    builtinCss.set(name, css);
  }
  return css;
}

/** Stylesheets of each built-in theme, applied in order. */
const THEME_FILES: Record<BuiltinTheme, string[]> = {
  antigravity: ["theme.css", "theme-antigravity.css"],
  "antigravity-dark": ["theme.css", "theme-antigravity.css", "theme-antigravity-dark.css"],
  light: ["theme.css"],
  dark: ["theme.css", "theme-dark.css"],
  academic_basic: ["theme.css", "theme-academic-basic.css"],
  tech_magazine: ["theme.css", "theme-tech-magazine.css"],
  "tech_magazine-dark": ["theme.css", "theme-tech-magazine.css", "theme-tech-magazine-dark.css"],
  preprint: ["theme.css", "theme-preprint.css"],
  open_access: ["theme.css", "theme-open-access.css"],
};

/** Stylesheets of a built-in theme, with the fonts it adds to the text and code ones. */
export function builtinThemeCss(theme: BuiltinTheme): string[] {
  const css = THEME_FILES[theme].map(asset);
  if (theme === "academic_basic") return [serifFontFaceCss(), ...css];
  if (isMagazineTheme(theme)) return [magazineFontFaceCss(), ...css];
  if (theme === "preprint") return [preprintFontFaceCss(), ...css];
  if (theme === "open_access") return [openAccessFontFaceCss(), ...css];
  return css;
}

/** Stylesheet for a density other than "normal", applied after the theme. */
export function densityCss(density: "normal" | "compact"): string[] {
  return density === "compact" ? [asset("density-compact.css")] : [];
}

export interface DocumentParts {
  title: string;
  body: string;
  /** Include KaTeX's stylesheet and fonts (only needed when the document has math). */
  math?: boolean;
  lang?: string;
  /** Front matter metadata. With `showTitle`, rendered as a title block before the body. */
  subtitle?: string;
  /** Authors; `^1,2^` marks affiliation numbers (superscripts in the title block). */
  author?: string;
  date?: string;
  kicker?: string;
  affiliations?: string[];
  /** Structured authors; replace `author` in the title block. */
  authors?: Author[];
  abstract?: string | Record<string, string>;
  keywords?: string[];
  showTitle?: boolean;
  /** A title block of the theme's own (the open_access first page), in place of the standard one. */
  titleHtml?: string;
  /** Extra classes of the title block (the magazine cover's ink and text position). */
  headerClass?: string;
  /** Theme stylesheet contents. Defaults to the built-in light theme. */
  themeCss?: string[];
  /** Text font to embed. Defaults to Manrope. */
  font?: TextFont;
  /** HTML placed before the document body (the watermarks). */
  beforeBody?: string;
  /** Layout stylesheets (density, font size, page height), applied after the theme. */
  layoutCss?: string[];
  /** Extra stylesheet contents, applied after the theme and layout. */
  extraCss?: string[];
}

/** The authors without their `^1,2^` affiliation marks, for metadata and page headers. */
export const plainAuthor = (author: string): string =>
  author.replace(/\^[^^\s][^^]*\^/g, "").trim();

/** Escaped text with `^…^` turned into superscripts. */
const withSuperscripts = (value: string): string =>
  escapeHtml(value).replace(/\^([^^\s][^^]*)\^/g, "<sup>$1</sup>");

/** Paragraphs of a text, separated by blank lines. */
const paragraphs = (value: string): string[] =>
  value
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`);

/** The abstract's paragraphs: plain text, or labelled parts ("<strong>Métodos:</strong> …"). */
export const abstractParagraphs = (abstract: string | Record<string, string>): string[] =>
  typeof abstract === "string"
    ? paragraphs(abstract)
    : Object.entries(abstract).map(
        ([label, text]) =>
          `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(text.trim())}</p>`,
      );

function titleBlock(parts: DocumentParts): string {
  const {
    title,
    subtitle,
    author,
    date,
    kicker,
    affiliations = [],
    abstract,
    keywords = [],
  } = parts;
  const labels = strings(parts.lang ?? DEFAULT_LANG);
  const { authors } = parts;
  const people = authors?.length ? authorsHtml(authors) : author ? withSuperscripts(author) : "";
  const meta = [people || undefined, date ? escapeHtml(date) : undefined];
  const corresponding = authors?.some((a) => a.corresponding)
    ? `<li class="doc-corresponding"><sup>*</sup>${escapeHtml(labels.correspondingAuthor)}</li>`
    : "";
  const metaText = meta.filter(Boolean).join(" · ");
  return [
    `<header class="doc-header${parts.headerClass ? ` ${escapeHtml(parts.headerClass)}` : ""}">`,
    kicker ? `<p class="doc-kicker">${escapeHtml(kicker)}</p>` : "",
    `<h1 class="doc-title">${escapeHtml(title)}</h1>`,
    subtitle ? `<p class="doc-subtitle">${escapeHtml(subtitle)}</p>` : "",
    metaText ? `<p class="doc-meta">${metaText}</p>` : "",
    affiliations.length || corresponding
      ? `<ol class="doc-affiliations">` +
        affiliations.map((a, i) => `<li><sup>${i + 1}</sup>${escapeHtml(a)}</li>`).join("") +
        corresponding +
        `</ol>`
      : "",
    abstract
      ? `<section class="doc-abstract">\n<p class="doc-abstract-title">${labels.abstract}</p>\n` +
        abstractParagraphs(abstract).join("\n") +
        `\n</section>`
      : "",
    keywords.length
      ? `<p class="doc-keywords"><span class="doc-keywords-label">${labels.keywords}:</span> ` +
        keywords.map(escapeHtml).join(", ") +
        `</p>`
      : "",
    `</header>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Wrap a rendered Markdown fragment in a complete, self-contained HTML document. */
export function buildHtmlDocument(parts: DocumentParts): string {
  const { title, body, math = false, lang, author, layoutCss = [], extraCss = [] } = parts;
  const themeCss = parts.themeCss ?? builtinThemeCss("light");
  const styles = [
    fontFaceCss(parts.font),
    ...(math ? [katexCss()] : []),
    ...themeCss,
    ...layoutCss,
    ...extraCss,
  ];

  return `<!doctype html>
<html${lang ? ` lang="${escapeHtml(lang)}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="mdrender ${escapeHtml(version)}">
${author ? `<meta name="author" content="${escapeHtml(plainAuthor(author))}">\n` : ""}<title>${escapeHtml(title)}</title>
${styles.map((css) => `<style>\n${css}\n</style>`).join("\n")}
</head>
<body>
${parts.beforeBody ? parts.beforeBody + "\n" : ""}<main class="markdown-body">
${parts.showTitle ? (parts.titleHtml ?? titleBlock(parts)) + "\n" : ""}${body}
</main>
</body>
</html>
`;
}

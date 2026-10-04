import { readFileSync } from "node:fs";
import { escapeHtml } from "../html.js";
import { fontFaceCss } from "./fonts.js";
import { katexCss } from "./katex.js";
import { version } from "../version.js";

export { escapeHtml };

const themeUrl = new URL("../assets/theme.css", import.meta.url);
let themeCss: string | undefined;

export interface DocumentParts {
  title: string;
  body: string;
  /** Include KaTeX's stylesheet and fonts (only needed when the document has math). */
  math?: boolean;
  lang?: string;
  /** Front matter metadata. With `showTitle`, rendered as a title block before the body. */
  subtitle?: string;
  author?: string;
  date?: string;
  showTitle?: boolean;
  /** Extra stylesheet contents, applied after the built-in theme. */
  extraCss?: string[];
}

function titleBlock({ title, subtitle, author, date }: DocumentParts): string {
  const meta = [author, date].filter(Boolean).map((part) => escapeHtml(part!));
  return [
    `<header class="doc-header">`,
    `<h1 class="doc-title">${escapeHtml(title)}</h1>`,
    subtitle ? `<p class="doc-subtitle">${escapeHtml(subtitle)}</p>` : "",
    meta.length ? `<p class="doc-meta">${meta.join(" · ")}</p>` : "",
    `</header>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Wrap a rendered Markdown fragment in a complete, self-contained HTML document. */
export function buildHtmlDocument(parts: DocumentParts): string {
  const { title, body, math = false, lang, author, extraCss = [] } = parts;
  themeCss ??= readFileSync(themeUrl, "utf8");
  const styles = [fontFaceCss(), ...(math ? [katexCss()] : []), themeCss, ...extraCss];

  return `<!doctype html>
<html${lang ? ` lang="${escapeHtml(lang)}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="mdrender ${escapeHtml(version)}">
${author ? `<meta name="author" content="${escapeHtml(author)}">\n` : ""}<title>${escapeHtml(title)}</title>
${styles.map((css) => `<style>\n${css}\n</style>`).join("\n")}
</head>
<body>
<main class="markdown-body">
${parts.showTitle ? titleBlock(parts) + "\n" : ""}${body}
</main>
</body>
</html>
`;
}

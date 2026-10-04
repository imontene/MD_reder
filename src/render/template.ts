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
}

/** Wrap a rendered Markdown fragment in a complete, self-contained HTML document. */
export function buildHtmlDocument({ title, body, math = false }: DocumentParts): string {
  themeCss ??= readFileSync(themeUrl, "utf8");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="mdrender ${escapeHtml(version)}">
<title>${escapeHtml(title)}</title>
<style>
${fontFaceCss()}
</style>
${math ? `<style>\n${katexCss()}\n</style>\n` : ""}<style>
${themeCss}
</style>
</head>
<body>
<main class="markdown-body">
${body}
</main>
</body>
</html>
`;
}

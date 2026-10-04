import { readFileSync } from "node:fs";
import { fontFaceCss } from "./fonts.js";
import { version } from "../version.js";

const themeUrl = new URL("../assets/theme.css", import.meta.url);
let themeCss: string | undefined;

export interface DocumentParts {
  title: string;
  body: string;
}

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Wrap a rendered Markdown fragment in a complete, self-contained HTML document. */
export function buildHtmlDocument({ title, body }: DocumentParts): string {
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
<style>
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

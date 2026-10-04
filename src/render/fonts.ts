import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/**
 * Static (non-variable) font files are used on purpose: Chromium embeds variable fonts in PDFs
 * as Type 3 fonts, while static fonts are embedded as proper TrueType fonts.
 */

/** Inter 4 (the typeface served by Google Fonts) from the upstream release, full glyph set. */
const INTER_FACES = [
  { weight: 400, style: "normal", file: "Inter-Regular.woff2" },
  { weight: 400, style: "italic", file: "Inter-Italic.woff2" },
  { weight: 600, style: "normal", file: "Inter-SemiBold.woff2" },
  { weight: 600, style: "italic", file: "Inter-SemiBoldItalic.woff2" },
  { weight: 700, style: "normal", file: "Inter-Bold.woff2" },
  { weight: 700, style: "italic", file: "Inter-BoldItalic.woff2" },
];

/** JetBrains Mono for code, from Fontsource (split into unicode-range subsets). */
const MONO_STYLESHEETS = [
  "@fontsource/jetbrains-mono/400.css",
  "@fontsource/jetbrains-mono/400-italic.css",
  "@fontsource/jetbrains-mono/700.css",
];

function woff2DataUri(file: string): string {
  return `data:font/woff2;base64,${readFileSync(file).toString("base64")}`;
}

function interCss(): string {
  const dir = path.join(path.dirname(require.resolve("inter-ui/package.json")), "web");
  return INTER_FACES.map(
    ({ weight, style, file }) => `@font-face {
  font-family: "Inter";
  font-style: ${style};
  font-weight: ${weight};
  font-display: block;
  src: url(${woff2DataUri(path.join(dir, file))}) format("woff2");
}`,
  ).join("\n");
}

/**
 * Inline a Fontsource stylesheet: the woff2 source becomes a data URI (the legacy woff fallback is
 * dropped) so the document needs no network or file access. `font-display: block` makes the
 * browser wait for the real font instead of printing with a fallback.
 */
export function inlineFontStylesheet(cssFile: string): string {
  const dir = path.dirname(cssFile);
  return readFileSync(cssFile, "utf8")
    .replace(/font-display:\s*swap/g, "font-display: block")
    .replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, "")
    .replace(
      /url\((['"]?)(\.\/files\/[^)'"]+\.woff2)\1\)/g,
      (_match, _quote, rel: string) => `url(${woff2DataUri(path.join(dir, rel))})`,
    );
}

let cached: string | undefined;

/** @font-face rules for every bundled font, with the font files embedded. */
export function fontFaceCss(): string {
  cached ??= [
    interCss(),
    ...MONO_STYLESHEETS.map((id) => inlineFontStylesheet(require.resolve(id))),
  ].join("\n");
  return cached;
}

import {
  INTER_DIR,
  INTER_FACES,
  MONO_STYLESHEETS,
  readAsset,
  readTextAsset,
  woff2References,
} from "../assets.js";

/**
 * Static (non-variable) font files are used on purpose: Chromium embeds variable fonts in PDFs
 * as Type 3 fonts, while static fonts are embedded as proper TrueType fonts.
 *
 * Text: Inter 4 (the typeface served by Google Fonts) from the upstream release, full glyph set.
 * Code: JetBrains Mono from Fontsource (split into unicode-range subsets).
 */

function woff2DataUri(key: string): string {
  return `data:font/woff2;base64,${readAsset(key).toString("base64")}`;
}

function interFace({ weight, style, file }: (typeof INTER_FACES)[number]): string {
  return `@font-face {
  font-family: "Inter";
  font-style: ${style};
  font-weight: ${weight};
  font-display: block;
  src: url(${woff2DataUri(`${INTER_DIR}/${file}`)}) format("woff2");
}`;
}

let regularFace: string | undefined;

/** Inter Regular alone, for page headers/footers (Chrome renders them apart from the page). */
export function interRegularFontFace(): string {
  regularFace ??= interFace(INTER_FACES[0]);
  return regularFace;
}

/**
 * Inline a Fontsource stylesheet: the woff2 source becomes a data URI (the legacy woff fallback is
 * dropped) so the document needs no network or file access. `font-display: block` makes the
 * browser wait for the real font instead of printing with a fallback.
 */
export function inlineFontStylesheet(cssKey: string): string {
  const css = readTextAsset(cssKey);
  const fonts = woff2References(cssKey, css);
  let index = 0;
  return css
    .replace(/font-display:\s*swap/g, "font-display: block")
    .replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, "")
    .replace(/url\((['"]?)([^)'"]+\.woff2)\1\)/g, () => `url(${woff2DataUri(fonts[index++]!)})`);
}

let cached: string | undefined;

/** @font-face rules for every bundled font, with the font files embedded. */
export function fontFaceCss(): string {
  cached ??= [...INTER_FACES.map(interFace), ...MONO_STYLESHEETS.map(inlineFontStylesheet)].join(
    "\n",
  );
  return cached;
}

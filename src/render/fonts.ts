import {
  INTER_DIR,
  INTER_FACES,
  MANROPE_STYLESHEETS,
  MONO_STYLESHEETS,
  readAsset,
  readTextAsset,
  woff2References,
} from "../assets.js";
import type { TextFont } from "../options.js";

/**
 * Static (non-variable) font files are used on purpose: Chromium embeds variable fonts in PDFs
 * as Type 3 fonts, while static fonts are embedded as proper TrueType fonts.
 *
 * Text: Manrope (default) from Fontsource, or Inter 4 from the upstream release (full glyph
 * set). Manrope covers Latin, Greek, Cyrillic and Vietnamese but has no italics (the browser
 * slants it) nor arrows and math symbols such as → ✓ ≤: those fall back to Inter, which is
 * embedded too in its regular and bold weights.
 * Code: JetBrains Mono from Fontsource (split into unicode-range subsets).
 */

export const FONT_FAMILIES: Record<TextFont, string> = { manrope: "Manrope", inter: "Inter" };

/** CSS font-family list for the text: the chosen font, Inter for missing glyphs, the system's. */
export function fontStack(font: TextFont): string {
  return font === "inter"
    ? `"Inter", system-ui, sans-serif`
    : `"Manrope", "Inter", system-ui, sans-serif`;
}

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

const interUpright = (weight: number) =>
  INTER_FACES.find((face) => face.weight === weight && face.style === "normal")!;

/** @font-face rules for the text font and its fallback, with the font files embedded. */
function textFaces(font: TextFont): string[] {
  if (font === "inter") return INTER_FACES.map(interFace);
  return [
    ...MANROPE_STYLESHEETS.map(inlineFontStylesheet),
    // Fallback for glyphs Manrope lacks; 600 text takes the nearest heavier face, 700.
    interFace(interUpright(400)),
    interFace(interUpright(700)),
  ];
}

const cached = new Map<TextFont, string>();

/** @font-face rules for every font a document uses, with the font files embedded. */
export function fontFaceCss(font: TextFont = "manrope"): string {
  let css = cached.get(font);
  if (css === undefined) {
    css = [...textFaces(font), ...MONO_STYLESHEETS.map(inlineFontStylesheet)].join("\n");
    cached.set(font, css);
  }
  return css;
}

let monoRegular: string | undefined;

/** JetBrains Mono Regular alone, for page headers/footers set in the mono family. */
export function monoRegularFontFace(): string {
  monoRegular ??= inlineFontStylesheet(MONO_STYLESHEETS[0]!);
  return monoRegular;
}

const regularFaces = new Map<TextFont, string>();

/** The text font's regular weight alone, for page headers/footers (rendered apart from the page). */
export function regularFontFace(font: TextFont = "manrope"): string {
  let css = regularFaces.get(font);
  if (css === undefined) {
    css =
      font === "inter"
        ? interFace(interUpright(400))
        : [inlineFontStylesheet(MANROPE_STYLESHEETS[0]!), interFace(interUpright(400))].join("\n");
    regularFaces.set(font, css);
  }
  return css;
}

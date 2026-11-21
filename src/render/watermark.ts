import { escapeHtml } from "../html.js";
import { FIELD_COLORS, fieldImage } from "./field.js";

/**
 * Watermarks in the Anti-Gravity gradient (field-blue → field-cyan → field-violet), PDF only:
 * a text set diagonally across every page, and soft fields of light in the top-left and
 * bottom-right corners of every page. Chrome repeats a `position: fixed` element on every
 * printed page, at the same place in the text area, so pagination is left alone.
 */

const FIELD = FIELD_COLORS;

export interface WatermarkOptions {
  /** Text set across every page; undefined or blank for none. */
  text?: string;
  /** Fields of light in the top-left and bottom-right corners of every page. */
  field: boolean;
  /** Size of the text area in CSS px (the text runs along its diagonal). */
  widthPx: number;
  heightPx: number;
  /** Dark page: the marks are a little stronger, as the design system's dark stage. */
  dark: boolean;
}

/**
 * Look of the diagonal text, by page tone: its opacity and the stops of its gradient (spread over
 * its letters, see textMark): the design system's blue, cyan and violet, a little stronger on
 * dark pages.
 */
export const WATERMARK_TEXT = {
  light: { opacity: 0.1, stops: [FIELD.blue, FIELD.cyan, FIELD.violet] },
  dark: { opacity: 0.14, stops: [FIELD.blue, FIELD.cyan, FIELD.violet] },
};

/** Angle (degrees, counter-clockwise) and font size (px) that fit `text` on the diagonal. */
export function diagonalText(text: string, widthPx: number, heightPx: number) {
  const angle = (Math.atan2(heightPx, widthPx) * 180) / Math.PI;
  const diagonal = Math.hypot(widthPx, heightPx);
  // Manrope 700 averages about 0.68 em for capitals and digits, 0.56 em for lowercase letters
  // and 0.3 em for spaces; the text takes ~70% of the diagonal.
  const ems = [...text].reduce(
    (sum, char) => sum + (char === " " ? 0.3 : /\p{Ll}/u.test(char) ? 0.56 : 0.68),
    0,
  );
  const fontSize = Math.min(heightPx * 0.2, (diagonal * 0.7) / Math.max(ems, 0.68));
  return { angle, fontSize: Math.round(fontSize) };
}

/**
 * `count` colours spread evenly along the gradient through `stops` (#rrggbb), one per letter of
 * the mark.
 */
export function gradientColors(stops: string[], count: number): string[] {
  const rgb = stops.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  return Array.from({ length: count }, (_, k) => {
    const t = count === 1 ? 0.5 : k / (count - 1);
    const at = t * (rgb.length - 1);
    const i = Math.min(Math.floor(at), rgb.length - 2);
    const f = at - i;
    const [a, b] = [rgb[i]!, rgb[i + 1]!];
    return (
      "#" +
      a
        .map((c, j) =>
          Math.round(c + (b[j]! - c) * f)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  });
}

function textMark(text: string, widthPx: number, heightPx: number, dark: boolean): string {
  const { angle, fontSize } = diagonalText(text, widthPx, heightPx);
  // HTML rather than SVG text: Chrome paints the SVG text of a fixed element on the first page
  // only, while HTML is repeated on every page like the rest of the element.
  // Each letter in a solid colour of the gradient, rather than a gradient clipped to the text
  // (background-clip: text): Chrome writes that clip as a chain of soft masks, which Adobe
  // Acrobat paints the first time a page is shown and then drops from its cache.
  const look = dark ? WATERMARK_TEXT.dark : WATERMARK_TEXT.light;
  const letters = [...text];
  const colors = gradientColors(look.stops, letters.length);
  const html = letters
    .map((letter, k) => `<span style="color: ${colors[k]}">${escapeHtml(letter)}</span>`)
    .join("");
  const style = `font-size: ${fontSize}px; transform: rotate(${(-angle).toFixed(2)}deg)`;
  return `<div class="mdr-watermark-text" style="opacity: ${look.opacity}"><span style="${style}">${html}</span></div>`;
}

function fieldMark(dark: boolean): string {
  // The same field as the title block's (render/field.ts), as a vector SVG image, in the
  // top-left and bottom-right corners of every page.
  const style = `style="background-image: ${fieldImage(dark)}"`;
  return [
    `<div class="mdr-watermark-field mdr-field-top-left" ${style}></div>`,
    `<div class="mdr-watermark-field mdr-field-bottom-right" ${style}></div>`,
  ].join("\n");
}

/** HTML of the requested marks, to go before the document body; "" when none is requested. */
export function watermarkHtml(options: WatermarkOptions): string {
  const text = options.text?.trim();
  if (!text && !options.field) return "";
  const parts = [
    options.field ? fieldMark(options.dark) : "",
    text ? textMark(text, options.widthPx, options.heightPx, options.dark) : "",
  ].filter(Boolean);
  const classes = options.dark ? "mdr-watermark mdr-watermark-dark" : "mdr-watermark";
  return `<div class="${classes}" aria-hidden="true">\n${parts.join("\n")}\n</div>`;
}

/**
 * Print-only placement: fixed over the text area of every page, above the content and blended
 * into it. Under the content, the marks were hidden by every figure, table and card, and lost
 * in dense text, so the word looked cut or missing. Blended above it (multiply on light pages,
 * screen on dark ones) they tint the paper, figures and tables alike while the text keeps its
 * own colour. A magazine's cover stays above them, clean. Hidden on screen. With the field on
 * every page, the title block's own field (Anti-Gravity) is dropped so the first page does not
 * get two.
 */
export const WATERMARK_CSS = `.mdr-watermark { display: none; }
@media print {
  .mdr-watermark {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    mix-blend-mode: multiply;
  }
  .mdr-watermark-dark { mix-blend-mode: screen; }
  .doc-header:is(.cover-ink-light, .cover-ink-dark) { position: relative; z-index: 3; }
  .mdr-watermark-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mdr-watermark-text > span {
    font-family: var(--font-text);
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1;
    white-space: nowrap;
  }
  .mdr-watermark-field {
    position: absolute;
    width: 40%;
    height: 230px;
    background-position: center;
    background-size: 100% 100%;
    background-repeat: no-repeat;
  }
  /* The lights gather towards the right of the field's box: mirror it so they sit in its corner. */
  .mdr-field-top-left { top: 0; left: 0; transform: scaleX(-1); }
  .mdr-field-bottom-right { bottom: 0; right: 0; transform: scaleY(-1); }
  .mdr-watermark:has(.mdr-watermark-field) ~ .markdown-body .doc-header::before { display: none; }
}`;

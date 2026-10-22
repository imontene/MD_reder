import { escapeHtml } from "../html.js";
import { FIELD_COLORS, fieldImage } from "./field.js";

/**
 * Watermarks in the Anti-Gravity gradient (field-blue → field-cyan → field-violet), PDF only:
 * a text set diagonally across every page, and a soft field of light in the top-right corner of
 * every page. Both sit behind the content. Chrome repeats a `position: fixed` element on every
 * printed page, at the same place in the text area, so pagination is left alone.
 */

const FIELD = FIELD_COLORS;

export interface WatermarkOptions {
  /** Text set across every page; undefined or blank for none. */
  text?: string;
  /** A field of light in the corner of every page. */
  field: boolean;
  /** Size of the text area in CSS px (the text runs along its diagonal). */
  widthPx: number;
  heightPx: number;
  /** Dark page: the marks are a little stronger, as the design system's dark stage. */
  dark: boolean;
}

/** Angle (degrees, counter-clockwise) and font size (px) that fit `text` on the diagonal. */
export function diagonalText(text: string, widthPx: number, heightPx: number) {
  const angle = (Math.atan2(heightPx, widthPx) * 180) / Math.PI;
  const diagonal = Math.hypot(widthPx, heightPx);
  // Manrope 600 capitals average about 0.68 em; the text takes ~70% of the diagonal.
  const chars = Math.max(1, [...text].length);
  const fontSize = Math.min(heightPx * 0.2, (diagonal * 0.7) / (chars * 0.68));
  return { angle, fontSize: Math.round(fontSize) };
}

function textMark(text: string, widthPx: number, heightPx: number, dark: boolean): string {
  const { angle, fontSize } = diagonalText(text, widthPx, heightPx);
  // HTML rather than SVG text: Chrome paints the SVG text of a fixed element on the first page
  // only, while HTML is repeated on every page like the rest of the element.
  return `<div class="mdr-watermark-text" style="opacity: ${dark ? 0.14 : 0.1}"><span style="font-size: ${fontSize}px; transform: rotate(${(-angle).toFixed(2)}deg)">${escapeHtml(text.toUpperCase())}</span></div>`;
}

function fieldMark(dark: boolean): string {
  // The same field as the title block's (render/field.ts), as a vector SVG image.
  return `<div class="mdr-watermark-field" style="background-image: ${fieldImage(dark)}"></div>`;
}

/** HTML of the requested marks, to go before the document body; "" when none is requested. */
export function watermarkHtml(options: WatermarkOptions): string {
  const text = options.text?.trim();
  if (!text && !options.field) return "";
  const parts = [
    options.field ? fieldMark(options.dark) : "",
    text ? textMark(text, options.widthPx, options.heightPx, options.dark) : "",
  ].filter(Boolean);
  return `<div class="mdr-watermark" aria-hidden="true">\n${parts.join("\n")}\n</div>`;
}

/**
 * Print-only placement: fixed over the text area of every page, under the content (the body
 * becomes a stacking layer above it). Hidden on screen. With the field on every page, the title
 * block's own field (Anti-Gravity) is dropped so the first page does not get two.
 */
export const WATERMARK_CSS = `.mdr-watermark { display: none; }
@media print {
  .mdr-watermark {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
  .markdown-body { position: relative; z-index: 1; }
  .mdr-watermark-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mdr-watermark-text span {
    font-family: var(--font-text);
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1;
    white-space: nowrap;
    color: transparent;
    background: linear-gradient(90deg, ${FIELD.blue}, ${FIELD.cyan}, ${FIELD.violet});
    -webkit-background-clip: text;
    background-clip: text;
  }
  .mdr-watermark-field {
    position: absolute;
    top: 0;
    right: 0;
    width: 40%;
    height: 230px;
    background-position: center;
    background-size: 100% 100%;
    background-repeat: no-repeat;
  }
  .mdr-watermark:has(.mdr-watermark-field) ~ .markdown-body .doc-header::before { display: none; }
}`;

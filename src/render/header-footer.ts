import { escapeHtml } from "../html.js";
import { interRegularFontFace } from "./fonts.js";

/**
 * Header/footer text with placeholders, in up to three columns separated by `|`:
 *
 *   "{title} | | {page} / {pages}"   → title on the left, page numbers on the right
 *   "Confidencial"                    → centered
 *
 * Placeholders: {page}, {pages}, {title}, {author}, {date}. Use `\|` for a literal bar.
 */
export interface HeaderFooterValues {
  title: string;
  author?: string;
  date?: string;
}

const CHROME_CLASSES: Record<string, string> = { page: "pageNumber", pages: "totalPages" };

function renderText(text: string, values: HeaderFooterValues): string {
  return escapeHtml(text.trim()).replace(/\{(\w+)\}/g, (match, name: string) => {
    const chromeClass = CHROME_CLASSES[name];
    if (chromeClass) return `<span class="${chromeClass}"></span>`;
    const value = values[name as keyof HeaderFooterValues];
    return value !== undefined ? escapeHtml(value) : match;
  });
}

/** Split on `|` (but not `\|`) into left, center and right columns. */
function columns(spec: string): [string, string, string] {
  const parts = spec.split(/(?<!\\)\|/).map((p) => p.replace(/\\\|/g, "|"));
  if (parts.length === 1) return ["", parts[0]!, ""];
  if (parts.length === 2) return [parts[0]!, "", parts[1]!];
  return [parts[0]!, parts[1]!, parts.slice(2).join("|")];
}

/**
 * Chrome header/footer template. Chrome renders it apart from the page, so it carries its own
 * styles and its own copy of Inter.
 */
export function headerFooterTemplate(
  spec: string | undefined,
  values: HeaderFooterValues,
  horizontalMargin: { left: string; right: string },
): string {
  if (!spec) return "<span></span>";
  const [left, center, right] = columns(spec).map((c) => renderText(c, values));
  return `<style>${interRegularFontFace()}</style>
<div style="box-sizing: border-box; width: 100%; display: flex; padding: 0 ${horizontalMargin.right} 0 ${horizontalMargin.left};
  font-family: Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 8pt; color: #59636e;">
  <span style="flex: 1; text-align: left;">${left}</span>
  <span style="flex: 1; text-align: center;">${center}</span>
  <span style="flex: 1; text-align: right;">${right}</span>
</div>`;
}

export const DEFAULT_FOOTER = "{page} / {pages}";

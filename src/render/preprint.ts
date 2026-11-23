import type { DocumentOptions, Margins } from "../options.js";
import { cssString, pageCss, type PageValues } from "./page-css.js";

/**
 * The preprint theme's page (theme-preprint.css has the look): a running head from page 2,
 * the folio centred at the foot, and on page 1 the optional stamp set sideways in the left
 * margin, read bottom to top as on arXiv. The stamp's text is the author's (`preprint-stamp`):
 * mdrender adds none.
 */

/** Default running head: "PREPRINT — <date>", set in spaced capitals by the stylesheet. */
const defaultHeader = (date: string | undefined) =>
  ` | | ${date ? "Preprint — {date}" : "Preprint"}`;

export interface PreprintInput {
  options: DocumentOptions;
  margin: Margins;
  values: PageValues;
}

/** Stylesheet with the page margins, running head, folio and stamp. */
export function preprintPage({ options, margin, values }: PreprintInput): string {
  const footer = options.footer ?? (options.pageNumbers ? " | {page} | " : undefined);
  const stamp = options.preprintStamp?.trim();
  return pageCss({
    margin,
    header: options.header ?? defaultHeader(options.date),
    footer,
    values,
    first: {
      noHeader: true,
      rules: stamp ? `  @left-middle { content: ${cssString(stamp)}; }\n` : "",
    },
  });
}

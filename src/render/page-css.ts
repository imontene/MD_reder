import type { Margins } from "../options.js";
import { columns } from "./header-footer.js";

/**
 * Pages drawn by the stylesheet: themes that print with no margins in Chrome (see convert.ts)
 * set the page margins, header and footer in CSS instead, with `@page` and its margin boxes.
 * That lets a cover bleed to the edges (magazine themes), the header use the document's own
 * fonts and a stamp sit sideways in a margin (preprint).
 *
 * Header and footer specs are the --header/--footer text: up to three columns split by `|`,
 * with {page} and {pages} as counters and any other {name} taken from `values`.
 */

/** A CSS string literal. */
export const cssString = (value: string): string =>
  `"${value.replace(/[\\"]/g, "\\$&").replace(/[\r\n]+/g, " ")}"`;

/** Values of the {name} placeholders: {title}, {author}, {date} and any a theme adds. */
export type PageValues = Record<string, string | undefined>;

const COUNTERS: Record<string, string> = { page: "counter(page)", pages: "counter(pages)" };

/** A header/footer column ("{magazine} · {date}") as a CSS `content` value. */
function marginContent(text: string, values: PageValues): string | undefined {
  const parts: string[] = [];
  let literal = "";
  for (const piece of text.trim().split(/(\{\w+\})/)) {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    const counter = name ? COUNTERS[name] : undefined;
    if (counter) {
      if (literal) parts.push(cssString(literal));
      parts.push(counter);
      literal = "";
      continue;
    }
    const value = name ? values[name] : undefined;
    literal += value ?? piece;
  }
  if (literal) parts.push(cssString(literal));
  return parts.length ? parts.join(" ") : undefined;
}

export const SIDES = ["left", "center", "right"] as const;

/** `@top-left { content: … }` and so on for a header or footer spec. */
export function marginBoxes(
  spec: string | undefined,
  edge: "top" | "bottom",
  values: PageValues,
): string {
  if (!spec) return "";
  return columns(spec)
    .map((column, i) => {
      const content = marginContent(column, values);
      return content ? `  @${edge}-${SIDES[i]} { content: ${content}; }\n` : "";
    })
    .join("");
}

/** `content: none` for every header box, or every header and footer box. */
const noBoxes = (edges: string[]) =>
  edges.flatMap((edge) => SIDES.map((side) => `  @${edge}-${side} { content: none; }\n`)).join("");

export interface PageCssInput {
  margin: Margins;
  header?: string;
  footer?: string;
  values: PageValues;
  /** Page 1: its own margin ("0" for a full-bleed cover), no header or footer, extra rules. */
  first?: { margin?: string; noHeader?: boolean; noHeaderFooter?: boolean; rules?: string };
}

/** `@page` with the margins, header and footer, and `@page :first` when asked. */
export function pageCss({ margin, header, footer, values, first }: PageCssInput): string {
  const page = [
    `  margin: ${margin.top} ${margin.right} ${margin.bottom} ${margin.left};\n`,
    marginBoxes(header, "top", values),
    marginBoxes(footer, "bottom", values),
  ].join("");
  const rules = [`@page {\n${page}}`];
  if (first) {
    const body = [
      first.margin !== undefined ? `  margin: ${first.margin};\n` : "",
      first.noHeaderFooter ? noBoxes(["top", "bottom"]) : first.noHeader ? noBoxes(["top"]) : "",
      first.rules ?? "",
    ].join("");
    if (body) rules.push(`@page :first {\n${body}}`);
  }
  return rules.join("\n");
}

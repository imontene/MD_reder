import type { PageSize } from "../options.js";

/** Paper sizes in millimetres, portrait (width, height). */
const PAPER_MM: Record<PageSize, [number, number]> = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
  Tabloid: [279.4, 431.8],
};

const PX_PER_UNIT: Record<string, number> = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };

export function lengthToPx(length: string): number {
  const match = /^(\d+(?:\.\d+)?)(mm|cm|in|px)$/.exec(length);
  if (!match) throw new Error(`invalid length: ${length}`);
  return Number(match[1]) * PX_PER_UNIT[match[2]!]!;
}

/** Width of the text column in CSS pixels, so diagrams are laid out at their printed size. */
export function contentWidthPx(
  pageSize: PageSize,
  landscape: boolean,
  margin: { left: string; right: string },
): number {
  const [width, height] = PAPER_MM[pageSize];
  const paperPx = ((landscape ? height : width) * 96) / 25.4;
  return Math.round(paperPx - lengthToPx(margin.left) - lengthToPx(margin.right));
}

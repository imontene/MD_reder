/**
 * Autofit for Mermaid flowcharts: pick, among several layouts of the same diagram, the one whose
 * text prints largest once the diagram is scaled to the text column and the page height.
 *
 * Mermaid wraps label lines at `flowchart.wrappingWidth`, and a flowchart laid out along one axis
 * can be far wider (or taller) than the page; the theme then shrinks the whole drawing, text
 * included. Wider wrapping makes tall diagrams shorter; turning a long left-to-right chain
 * top-to-bottom makes it fit the column. Neither has one value that suits every diagram, so each
 * flowchart is rendered a few times and measured. Everything here is pure; the rendering loop is
 * in render/mermaid.ts.
 */

export const FLOW_DIRECTIONS = ["TB", "TD", "BT", "LR", "RL"] as const;
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number];

/** Label wrapping widths tried, in px; undefined is Mermaid's own default (the layout as today). */
export const WRAPPING_WIDTHS: readonly (number | undefined)[] = [
  undefined,
  200,
  300,
  400,
  600,
  900,
];

/** Candidates within this scale of the best one read the same; the shorter one wins. */
export const SCALE_TOLERANCE = 0.05;

/** Only turn a diagram whose best scale in its own direction is below this (text under ~10 px)… */
export const FLIP_BELOW = 0.75;
/** …and only when turning it raises the scale by at least this much. */
export const FLIP_GAIN = 0.15;

/** Below this scale the diagram is reported: no layout makes it readable, its content must change. */
export const SMALL_SCALE = 0.5;

/** The axis-swapped direction: horizontal flowcharts go top-to-bottom, vertical ones left-to-right. */
const FLIPPED: Record<FlowDirection, FlowDirection> = {
  LR: "TB",
  RL: "TB",
  TB: "LR",
  TD: "LR",
  BT: "LR",
};

export interface FlowchartHeader {
  /** Index of the header line in `source.split("\n")`. */
  line: number;
  /** Direction as written; flowcharts without one are top-to-bottom. */
  direction: FlowDirection;
}

const HEADER = /^(\s*(?:flowchart|graph))(?:[ \t]+(TB|TD|BT|LR|RL))?(?=\s|;|$)/i;

/** Lines of the diagram after Mermaid's optional front matter (`---` … `---`). */
function bodyStart(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return 0;
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  return end === -1 ? 0 : end + 1;
}

/**
 * The flowchart's header line and main direction, or undefined when the source is another kind
 * of diagram. Blank lines and `%%` comments before the header are skipped.
 */
export function flowchartHeader(source: string): FlowchartHeader | undefined {
  const lines = source.split("\n");
  for (let i = bodyStart(lines); i < lines.length; i++) {
    const text = lines[i]!.trim();
    if (text === "" || text.startsWith("%%")) continue;
    const match = HEADER.exec(lines[i]!);
    if (!match) return undefined;
    const direction = (match[2]?.toUpperCase() ?? "TB") as FlowDirection;
    return { line: i, direction };
  }
  return undefined;
}

/** The source with its main direction replaced; subgraph directions are left alone. */
export function withDirection(
  source: string,
  header: FlowchartHeader,
  direction: FlowDirection,
): string {
  const lines = source.split("\n");
  lines[header.line] = lines[header.line]!.replace(
    HEADER,
    (_m, keyword: string) => `${keyword} ${direction}`,
  );
  return lines.join("\n");
}

export function flippedDirection(direction: FlowDirection): FlowDirection {
  return FLIPPED[direction];
}

/**
 * The diagram sets its own Mermaid configuration (an `%%{init: …}%%` directive or `config:` in
 * its front matter): it is drawn exactly as written.
 */
export function authorConfigured(source: string): boolean {
  if (/%%\{\s*(?:init|initialize)\b/i.test(source)) return true;
  const lines = source.split("\n");
  const start = bodyStart(lines);
  return start > 0 && lines.slice(1, start - 1).some((line) => /^\s*config\s*:/.test(line));
}

/** Width and height of an SVG from its viewBox. */
export function measureSvg(svg: string): { width: number; height: number } | undefined {
  const match = /viewBox="\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)\s*"/.exec(svg);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

export interface Fit {
  /** Text column width in CSS px. */
  width: number;
  /** Largest printed height in CSS px; Infinity without pages (HTML). */
  height: number;
}

/** How much the diagram is shrunk when printed: 1 is its natural size. */
export function printScale(size: { width: number; height: number }, fit: Fit): number {
  return Math.min(1, fit.width / size.width, fit.height / size.height);
}

export interface Candidate {
  svg: string;
  /** Label wrapping width in px; undefined is Mermaid's default. */
  wrap: number | undefined;
  flipped: boolean;
  width: number;
  height: number;
  scale: number;
}

export function candidate(
  svg: string,
  wrap: number | undefined,
  flipped: boolean,
  fit: Fit,
): Candidate | undefined {
  const size = measureSvg(svg);
  return size && { svg, wrap, flipped, ...size, scale: printScale(size, fit) };
}

const printedHeight = (c: Candidate) => Math.round(c.height * c.scale);

/**
 * Best of one direction's candidates: those within SCALE_TOLERANCE of the top scale and never
 * below the layout as written (`base`), then the shortest printed, then the largest scale.
 */
function bestOf(candidates: Candidate[], base: Candidate): Candidate | undefined {
  const top = Math.max(...candidates.map((c) => c.scale));
  return candidates
    .filter((c) => c.scale >= top - SCALE_TOLERANCE && c.scale >= base.scale - 1e-9)
    .sort((a, b) => printedHeight(a) - printedHeight(b) || b.scale - a.scale)[0];
}

/** Whether a turned layout is worth trying, given the best layout in the written direction. */
export const flipWorthTrying = (best: Candidate) => best.scale < FLIP_BELOW - 1e-9;

/**
 * The chosen layout. `base` is the diagram as written (Mermaid's default wrapping, its own
 * direction); the result is never smaller than it. A turned layout wins only when the written
 * direction stays below FLIP_BELOW and turning gains at least FLIP_GAIN.
 */
export function chooseCandidate(candidates: Candidate[], base: Candidate): Candidate {
  const written = bestOf(
    candidates.filter((c) => !c.flipped),
    base,
  );
  const best = written ?? base;
  const turned = candidates.filter((c) => c.flipped);
  if (turned.length === 0 || !flipWorthTrying(best)) return best;
  const flipped = bestOf(turned, base);
  return flipped && flipped.scale >= best.scale + FLIP_GAIN - 1e-9 ? flipped : best;
}

/**
 * Whether wider wrapping in this direction can still help: once the diagram is wider than the
 * column and its scale went down, wider labels only make it wider.
 */
export function wrapsExhausted(current: Candidate, previous: Candidate | undefined, fit: Fit) {
  return previous !== undefined && current.width > fit.width && current.scale < previous.scale;
}

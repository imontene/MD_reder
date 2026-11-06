/**
 * The finish mdrender gives Mermaid diagrams, in every theme:
 *
 * - shapes with slightly rounded corners: rectangles (nodes, subgraphs, sequence actors and
 *   notes) through CSS `rx`/`ry`, and polygon nodes (decision, hexagon, parallelogram,
 *   trapezoid) redrawn as paths with eased corners, since an SVG polygon has no corner radius;
 * - subgraph titles in bold;
 * - shape and subgraph fills kept in their colours but partly transparent, so the page and its
 *   watermarks show through.
 *
 * The CSS goes to Mermaid as `themeCSS`, so it applies while Mermaid measures labels: a bold
 * subgraph title gets the room it needs. Polygons are rounded after rendering, which leaves the
 * diagram's size unchanged.
 */

/** Corner radius of rectangles and polygon nodes, in CSS px. */
export const CORNER_RADIUS = 5;

/** Opacity of shape and subgraph fills (strokes and text stay opaque). */
export const FILL_OPACITY = 0.72;

const SHAPES = [
  ".node rect",
  ".node polygon",
  ".node circle",
  ".node ellipse",
  ".node path.label-container",
  // Hand-drawn shapes (flag, cylinder…) carry the class on their group: fill-opacity inherits.
  ".node .outer-path",
  ".cluster rect",
  "rect.actor",
  "rect.note",
];

export const MERMAID_THEME_CSS = [
  `.node rect, .cluster rect, rect.actor, rect.note { rx: ${CORNER_RADIUS}px; ry: ${CORNER_RADIUS}px; }`,
  `${SHAPES.join(", ")} { fill-opacity: ${FILL_OPACITY}; }`,
  ".cluster-label, .cluster-label * { font-weight: 700; }",
  // Mermaid's "neo" look drops a shadow under shapes; under a see-through fill it would show
  // through the whole shape and grey it, hiding the page behind instead of revealing it.
  `${SHAPES.join(", ")}, .node .outer-path path { filter: none !important; }`,
].join("\n");

type Point = [number, number];

function parsePoints(points: string): Point[] | undefined {
  const numbers = points
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (numbers.length < 6 || numbers.length % 2 !== 0 || numbers.some((n) => !Number.isFinite(n))) {
    return undefined;
  }
  const result: Point[] = [];
  for (let i = 0; i < numbers.length; i += 2) result.push([numbers[i]!, numbers[i + 1]!]);
  return result;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Path data for a closed polygon whose corners are eased with quadratic curves of `radius`
 * (smaller where an edge is too short for it: at most a third of each adjacent edge).
 */
export function roundedPolygonPath(points: Point[], radius = CORNER_RADIUS): string {
  const n = points.length;
  const corners = points.map((p, i) => {
    const prev = points[(i - 1 + n) % n]!;
    const next = points[(i + 1) % n]!;
    const toPrev = Math.hypot(prev[0] - p[0], prev[1] - p[1]);
    const toNext = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const r = Math.min(radius, toPrev / 3, toNext / 3);
    const along = (q: Point, d: number): Point =>
      d === 0 ? p : [p[0] + ((q[0] - p[0]) * r) / d, p[1] + ((q[1] - p[1]) * r) / d];
    return { start: along(prev, toPrev), corner: p, end: along(next, toNext) };
  });
  const fmt = (p: Point) => `${round(p[0])},${round(p[1])}`;
  const parts = [`M${fmt(corners[0]!.end)}`];
  for (let i = 1; i <= n; i++) {
    const c = corners[i % n]!;
    parts.push(`L${fmt(c.start)}`, `Q${fmt(c.corner)} ${fmt(c.end)}`);
  }
  return parts.join(" ") + " Z";
}

const near = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5;

/** Distance from q to the line through a and b. */
function offLine(a: Point, b: Point, q: Point): number {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length === 0) return Math.hypot(q[0] - a[0], q[1] - a[1]);
  return Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / length;
}

/**
 * The corners of a closed shape drawn only with straight lines written as cubic segments, as
 * Mermaid draws its flag and other hand-drawn polygons: the fill as one subpath, the outline as
 * each side drawn twice ("M a C … b M a C … b M b C … c …"). Undefined for any path with a curve,
 * another command, a gap or an open end.
 */
export function straightPathCorners(d: string): Point[] | undefined {
  const tokens = d.match(/[a-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const segments: [Point, Point][] = [];
  let current: Point | undefined;
  let i = 0;
  const take = (): Point | undefined => {
    const x = Number(tokens[i]);
    const y = Number(tokens[i + 1]);
    i += 2;
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined;
  };
  while (i < tokens.length) {
    const command = tokens[i++]!;
    if (command === "M") {
      current = take();
      if (!current) return undefined;
    } else if (command === "C" && current) {
      // One or more segments after a single "C".
      do {
        const c1 = take();
        const c2 = take();
        const to = take();
        if (!c1 || !c2 || !to) return undefined;
        if (offLine(current, to, c1) > 0.5 || offLine(current, to, c2) > 0.5) return undefined;
        segments.push([current, to]);
        current = to;
      } while (i < tokens.length && !/[a-z]/i.test(tokens[i]!));
    } else if (command === "Z" || command === "z") {
      continue;
    } else {
      return undefined;
    }
  }
  // Drop each side's repeated stroke, then the sides must chain into a closed shape.
  const sides = segments.filter(
    ([from, to], k) =>
      k === 0 || !(near(from, segments[k - 1]![0]) && near(to, segments[k - 1]![1])),
  );
  if (sides.length < 3) return undefined;
  for (let k = 1; k < sides.length; k++)
    if (!near(sides[k]![0], sides[k - 1]![1])) return undefined;
  if (!near(sides.at(-1)![1], sides[0]![0])) return undefined;
  const corners = sides.map(([from]) => from);
  // Drop points that do not turn (several segments along one side).
  const turning = corners.filter((p, k) => {
    const prev = corners[(k - 1 + corners.length) % corners.length]!;
    const next = corners[(k + 1) % corners.length]!;
    return offLine(prev, next, p) > 0.5;
  });
  return turning.length >= 3 ? turning : undefined;
}

const NODE_PATH = /<path\b([^>]*?)\sd="([^"]*)"/g;

const NODE_POLYGON = /<polygon\b([^>]*?)\spoints="([^"]*)"([^>]*?)(\/?)>(<\/polygon>)?/g;

/**
 * Round the corners of node polygons: `<polygon class="label-container">` (decision, hexagon,
 * parallelogram, trapezoid) and closed shapes drawn only with straight segments (the flag).
 * Other polygons and paths (arrowheads, edges, curved shapes) are left alone.
 */
export function roundNodePolygons(svg: string, radius = CORNER_RADIUS): string {
  return svg
    .replace(NODE_POLYGON, (tag, before: string, points: string, after: string) => {
      if (!/\bclass="[^"]*\blabel-container\b/.test(before + after)) return tag;
      const parsed = parsePoints(points);
      if (!parsed) return tag;
      return `<path${before} d="${roundedPolygonPath(parsed, radius)}"${after}></path>`;
    })
    .replace(NODE_PATH, (tag, before: string, d: string) => {
      const corners = straightPathCorners(d);
      return corners ? `<path${before} d="${roundedPolygonPath(corners, radius)}"` : tag;
    });
}

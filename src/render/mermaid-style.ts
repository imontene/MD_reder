/**
 * The finish mdrender gives Mermaid diagrams, in every theme:
 *
 * - shapes with slightly rounded corners: rectangles (nodes, subgraphs, sequence actors and
 *   notes) through CSS `rx`/`ry`, and polygon nodes (decision, hexagon, parallelogram,
 *   trapezoid) redrawn as paths with eased corners, since an SVG polygon has no corner radius;
 * - subgraph titles in bold;
 * - shape and subgraph fills kept in their colours but partly transparent, so the page and its
 *   watermarks show through;
 * - shapes (not subgraphs) filled with a very soft top-to-bottom gradient of their colour;
 * - subgraph titles on a header band, a little darker than the subgraph (lighter on a dark one).
 *
 * The CSS goes to Mermaid as `themeCSS`, so it applies while Mermaid measures labels: a bold
 * subgraph title gets the room it needs, and `subGraphTitleMargin` leaves room for its band.
 * The rest is done to the rendered SVG, which leaves the diagram's size unchanged: in the page
 * Mermaid draws in, FILL_PROBE notes the colour Mermaid gave each shape (author `classDef` and
 * `style` included); finishDiagram then rounds polygons, adds the gradients and the bands.
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

/** Lightness added at the top of a shape's gradient and taken at its bottom, in HSL points. */
export const GRADIENT_STEP = 4;

/** How much darker (on a dark subgraph, lighter) a subgraph's header band is, in HSL points. */
export const HEADER_STEP = 7;

/** Room Mermaid leaves around a subgraph title (`flowchart.subGraphTitleMargin`), in px. */
export const SUBGRAPH_TITLE_MARGIN = { top: 3, bottom: 6 };

const FILL_ATTR = "data-mdr-fill";
const CLUSTER_FILL_ATTR = "data-mdr-cluster-fill";

/** Shapes that get a gradient: flowchart (and other) nodes, sequence actors and notes. */
const GRADIENT_SHAPES = [
  ".node rect.label-container",
  ".node polygon.label-container",
  ".node path.label-container",
  ".node circle",
  ".node ellipse",
  ".node .outer-path path",
  "rect.actor",
  "rect.note",
].join(", ");

/**
 * Runs in Mermaid's page (as source text, so no build step touches it): takes a rendered SVG,
 * writes the fill colour Mermaid computed for each shape, and for each flowchart subgraph, into
 * data attributes, and returns the SVG again.
 */
export const FILL_PROBE = `(svgText) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  try {
    host.innerHTML = svgText;
    const svg = host.querySelector("svg");
    if (!svg) return svgText;
    const solid = (fill) => /^rgb\\(|^rgba\\((?![^)]*,\\s*0\\))/.test(fill);
    for (const shape of svg.querySelectorAll(${JSON.stringify(GRADIENT_SHAPES)})) {
      if (shape.closest(".cluster")) continue;
      const fill = getComputedStyle(shape).fill;
      if (solid(fill)) shape.setAttribute("${FILL_ATTR}", fill);
    }
    if ((svg.getAttribute("aria-roledescription") || "").startsWith("flowchart")) {
      for (const cluster of svg.querySelectorAll("g.cluster")) {
        const rect = cluster.querySelector(":scope > rect");
        if (!rect || !cluster.querySelector(":scope > .cluster-label")) continue;
        const fill = getComputedStyle(rect).fill;
        if (solid(fill)) rect.setAttribute("${CLUSTER_FILL_ATTR}", fill);
      }
    }
    return svg.outerHTML;
  } finally {
    host.remove();
  }
}`;

type Hsl = [number, number, number];

/** "rgb(r, g, b)" or "rgba(r, g, b, a)" (as getComputedStyle gives it) in HSL. */
export function rgbToHsl(color: string): Hsl | undefined {
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color);
  if (!match) return undefined;
  const [r, g, b] = [match[1], match[2], match[3]].map((v) => Number(v) / 255) as Hsl;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

const hsl = ([h, s, l]: Hsl, dl: number) =>
  `hsl(${round(h)} ${round(s)}% ${round(Math.max(0, Math.min(100, l + dl)))}%)`;

/** Set fill and fill-opacity (over Mermaid's CSS and the author's inline styles) on a tag. */
function withFill(tag: string, fill: string, opacity: number): string {
  const set = `fill: ${fill} !important; fill-opacity: ${opacity} !important`;
  const style = /\sstyle="([^"]*)"/.exec(tag);
  if (!style) return tag.replace(/^<\w+/, (open) => `${open} style="${set}"`);
  const rest = style[1]!.trim().replace(/;?$/, style[1]!.trim() ? "; " : "");
  return tag.replace(style[0], ` style="${rest}${set}"`);
}

/**
 * Give every shape FILL_PROBE marked a vertical gradient of its colour: GRADIENT_STEP lighter at
 * the top, as much darker at the bottom. One gradient per colour, named after the diagram. The
 * see-through FILL_OPACITY goes in the gradient's stops: Chrome drops fill-opacity from a
 * gradient fill when it prints to PDF.
 */
export function addFillGradients(svg: string): string {
  const id = /<svg\b[^>]*?\sid="([^"]+)"/.exec(svg)?.[1] ?? "mermaid";
  const gradients = new Map<string, string>();
  const marked = new RegExp(`<\\w+\\b[^>]*?\\s${FILL_ATTR}="([^"]*)"[^>]*>`, "g");
  const out = svg.replace(marked, (tag, color: string) => {
    const bare = tag.replace(` ${FILL_ATTR}="${color}"`, "");
    const base = rgbToHsl(color);
    if (!base) return bare;
    let name = gradients.get(color);
    if (!name) {
      name = `${id}-fill-${gradients.size}`;
      gradients.set(color, name);
    }
    return withFill(bare, `url(#${name})`, 1);
  });
  if (gradients.size === 0) return out;
  const defs = [...gradients]
    .map(([color, name]) => {
      const base = rgbToHsl(color)!;
      return (
        `<linearGradient id="${name}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${hsl(base, GRADIENT_STEP)}" stop-opacity="${FILL_OPACITY}"></stop>` +
        `<stop offset="1" stop-color="${hsl(base, -GRADIENT_STEP)}" stop-opacity="${FILL_OPACITY}"></stop>` +
        `</linearGradient>`
      );
    })
    .join("");
  return out.replace(/<svg\b[^>]*>/, (open) => `${open}<defs>${defs}</defs>`);
}

const number = (tag: string, name: string) =>
  Number(new RegExp(`\\s${name}="(-?[\\d.]+)"`).exec(tag)?.[1]);

const CLUSTER =
  /(<g class="cluster\b[^"]*"[^>]*>)(<rect\b[^>]*>(?:<\/rect>)?)(<g class="cluster-label\b[^"]*" transform="translate\(\s*-?[\d.]+[\s,]+(-?[\d.]+)\s*\)"><foreignObject\b[^>]*>)/g;

/**
 * Put a header band behind each flowchart subgraph title FILL_PROBE marked: as wide as the
 * subgraph, from its top to SUBGRAPH_TITLE_MARGIN.bottom under the title, with the subgraph's
 * rounded top corners, in its colour HEADER_STEP darker (lighter when the subgraph is dark).
 */
export function addClusterHeads(svg: string, radius = CORNER_RADIUS): string {
  return svg.replace(CLUSTER, (all, open: string, rect: string, label: string, ty: string) => {
    const color = new RegExp(`\\s${CLUSTER_FILL_ATTR}="([^"]*)"`).exec(rect)?.[1];
    if (color === undefined) return all;
    const bare = rect.replace(` ${CLUSTER_FILL_ATTR}="${color}"`, "");
    const base = rgbToHsl(color);
    const [x, y, w] = [number(rect, "x"), number(rect, "y"), number(rect, "width")];
    const labelHeight = number(label, "height");
    if (!base || ![x, y, w, labelHeight].every(Number.isFinite)) return open + bare + label;
    // Inside the subgraph's 1 px outline, which stays on top of the band.
    const left = x + 0.5;
    const top = y + 0.5;
    const right = x + w - 0.5;
    const bottom = Number(ty) + labelHeight + SUBGRAPH_TITLE_MARGIN.bottom;
    const r = Math.max(0, Math.min(radius - 0.5, (bottom - top) / 2));
    const d =
      `M${round(left)},${round(bottom)} L${round(left)},${round(top + r)} ` +
      `Q${round(left)},${round(top)} ${round(left + r)},${round(top)} ` +
      `L${round(right - r)},${round(top)} Q${round(right)},${round(top)} ${round(right)},${round(top + r)} ` +
      `L${round(right)},${round(bottom)} Z`;
    const fill = hsl(base, base[2] < 50 ? HEADER_STEP : -HEADER_STEP);
    const band = `<path class="cluster-head" d="${d}" style="fill: ${fill}; fill-opacity: ${FILL_OPACITY}; stroke: none"></path>`;
    return open + bare + band + label;
  });
}

/** Everything done to a rendered diagram: rounded polygons, gradients, subgraph headers. */
export function finishDiagram(svg: string): string {
  return addClusterHeads(addFillGradients(roundNodePolygons(svg)));
}

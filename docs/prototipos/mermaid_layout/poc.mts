// Proof of concept for step 7.1 of PLAN_MAESTRO (docs/ESPECIFICACION_MERMAID_LAYOUT.md):
// custom Mermaid layouts that measure (mdr-measure) and draw at given positions (mdr-place),
// with a throwaway engine (serpentine for chains, layers for the rest), compared with the real
// classic render (autofit included) on the flowcharts of tests/fixtures/mermaid-autofit.md plus
// a few synthetic cases. Disposable: the real code goes to src/render/mermaid-compose/.
//
// From the repository root (a Chromium-based browser is found as mdrender finds it; set
// MDRENDER_BROWSER to choose one):
//   npx tsx docs/prototipos/mermaid_layout/poc.mts
// Writes galeria.png and resultados.md next to this file (and a PDF of the gallery, checked for
// raster images, to the system's temporary folder).
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MERMAID_JS, readTextAsset } from "../../../src/assets.ts";
import { findBrowser } from "../../../src/browser/detect.ts";
import type { MermaidBlock } from "../../../src/markdown/env.ts";
import { mermaidThemeVariables } from "../../../src/render/antigravity.ts";
import { BrowserSession } from "../../../src/render/browser.ts";
import { fontFaceCss, fontStack } from "../../../src/render/fonts.ts";
import { renderMermaid } from "../../../src/render/mermaid.ts";
import {
  authorConfigured,
  candidate,
  flippedDirection,
  flowchartHeader,
  measureSvg,
  printScale,
  withDirection,
  type Fit,
} from "../../../src/render/mermaid-fit.ts";
import {
  FILL_PROBE,
  finishDiagram,
  MERMAID_THEME_CSS,
  SUBGRAPH_TITLE_MARGIN,
} from "../../../src/render/mermaid-style.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");

/** A4 with 20 mm margins: text column, and text height minus 6 mm (as convert.ts). */
const FIT: Fit = { width: 642, height: Math.round(((297 - 40 - 6) * 96) / 25.4) };
const FONT_PX = 14;
const GRID = 8;
/** Serpentine only for chains this long (author's decision after the blind gallery, §5.4). */
const SERPENTINE_MIN = 8;

// ---------------------------------------------------------------------------------------------
// Cases

interface Case {
  title: string;
  source: string;
  /** Extra Mermaid configuration for both renders (e.g. a look). */
  config?: Record<string, unknown>;
}

function fromFile(path: string): Case[] {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  return [...text.matchAll(/```mermaid\n([\s\S]*?)```/g)]
    .map((m) => m[1]!)
    .filter((source) => flowchartHeader(source) && !authorConfigured(source))
    .map((source, i) => {
      const first = /\["([^"]{1,60})/.exec(source)?.[1] ?? "";
      return { title: `R${i + 1}. ${first}…`, source };
    });
}

function corpus(): Case[] {
  const text = readFileSync(join(repo, "tests/fixtures/mermaid-autofit.md"), "utf8");
  const cases: Case[] = [];
  const re = /^## (.+)\n\n```mermaid\n([\s\S]*?)```/gm;
  for (const m of text.matchAll(re)) {
    const source = m[2]!;
    if (!flowchartHeader(source) || authorConfigured(source)) continue;
    cases.push({ title: m[1]!, source });
  }
  return cases;
}

const EXTRA: Case[] = [
  {
    title: "E1. Formas, classDef y style",
    source: `flowchart TD
  A([Inicio]) --> B[/Entrada de datos/]
  B --> C{{Preparar}}
  C --> D[[Subrutina]]
  D --> E>Bandera]
  E --> F((Círculo))
  F --> G[(Base de datos)]
  G --> H@{ shape: doc, label: "Documento" }
  classDef alerta fill:#fde2e2,stroke:#c0392b
  class C alerta
  style F fill:#e0f0ff
`,
  },
  {
    title: "E2. Aristas: etiquetas, punteada, gruesa, invisible, retorno y subgrafo",
    source: `flowchart LR
  A[Recibir pedido] -->|válido| B[Procesar]
  A -.->|inválido| X[Rechazar]
  B ==> C[Guardar]
  C --> D[Notificar]
  D -. reintento .-> B
  C ~~~ X
  subgraph S [Almacén]
    direction TB
    DB1[(Primario)] --> DB2[(Réplica)]
  end
  C --> S
  S --> R[Informe]
  linkStyle 2 stroke:#c0392b
`,
  },
  {
    title: "E3. Caso 8 con look handDrawn",
    source: "",
    config: { look: "handDrawn", handDrawnSeed: 3 },
  },
];

// ---------------------------------------------------------------------------------------------
// Page layouts (source text, like FILL_PROBE)

const MEASURE_LAYOUT = `{ name: "mdr-measure", loader: async () => ({ render: async (data, svg, h) => {
  const scratch = svg.insert("g").attr("class", "mdr-measure");
  const out = { direction: data.direction, nodes: [], edges: [], clusters: [] };
  let order = 0;
  for (const n of data.nodes) {
    if (n.isGroup) {
      const probe = { ...n, x: 0, y: 0, width: 0, height: 0 };
      const r = await h.insertCluster(scratch, probe);
      out.clusters.push({ id: n.id, title: String(n.label ?? ""), parentId: n.parentId, dir: n.dir,
        titleWidth: r.labelBBox.width, titleHeight: r.labelBBox.height, order: order++ });
    } else {
      await h.insertNode(scratch, n, { config: data.config, dir: data.direction });
      out.nodes.push({ id: n.id, label: String(n.label ?? ""), shape: n.shape, parentId: n.parentId,
        width: n.width, height: n.height, order: order++ });
    }
  }
  for (const e of data.edges) {
    if (e.label) await h.insertEdgeLabel(scratch, e);
    out.edges.push({ id: e.id, from: e.start, to: e.end, label: e.label || "",
      labelWidth: e.label ? e.width : 0, labelHeight: e.label ? e.height : 0,
      pattern: e.pattern, type: e.type, minlen: e.minlen ?? 1, order: order++ });
  }
  globalThis.mdrMeasured = out;
} }) }`;

const PLACE_LAYOUT = `{ name: "mdr-place", loader: async () => ({ render: async (data, svg, h) => {
  const plan = globalThis.mdrPlan;
  const placed = { nodes: {}, clusters: {} };
  h.insertMarkers(svg, data.markers, data.type, data.diagramId);
  const clustersG = svg.insert("g").attr("class", "clusters");
  const edgePathsG = svg.insert("g").attr("class", "edgePaths");
  const edgeLabelsG = svg.insert("g").attr("class", "edgeLabels");
  const nodesG = svg.insert("g").attr("class", "nodes");
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  for (const n of data.nodes.filter((n) => n.isGroup)) {
    const c = plan.clusters[n.id];
    if (!c) throw new Error("mdr-place: no position for subgraph " + n.id);
    Object.assign(n, c);
    await h.insertCluster(clustersG, n);
    placed.clusters[n.id] = { width: n.width, height: n.height };
  }
  for (const n of data.nodes.filter((n) => !n.isGroup)) {
    const p = plan.nodes[n.id];
    if (!p) throw new Error("mdr-place: no position for node " + n.id);
    if (p.width) n.width = p.width;
    if (p.height) n.height = p.height;
    const el = await h.insertNode(nodesG, n, { config: data.config, dir: data.direction });
    n.x = p.x;
    n.y = p.y;
    el.attr("transform", "translate(" + p.x + ", " + p.y + ")");
    placed.nodes[n.id] = { width: n.width, height: n.height, domId: el.attr("id") };
  }
  for (const e of data.edges) {
    const p = plan.edges[e.id];
    if (!p) throw new Error("mdr-place: no route for edge " + e.id);
    if (e.label) await h.insertEdgeLabel(edgeLabelsG, e);
    e.points = p.points.map((q) => ({ x: q.x, y: q.y }));
    if (p.curve) e.curve = p.curve;
    if (p.label) {
      e.x = p.label.x;
      e.y = p.label.y - plan.labelShift;
    }
    // exact: the route already starts and ends on the shapes' borders (ELK); draw it as given.
    const paths = h.insertEdge(edgePathsG, e, new Map(), data.type, byId.get(e.start), byId.get(e.end), data.diagramId, !!p.exact);
    h.positionEdgeLabel(e, paths);
  }
  globalThis.mdrPlaced = placed;
} }) }`;

/** Reads the drawn SVG back: node transforms and the ends of each edge path. */
const READ_BACK = `(svgText) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  try {
    host.innerHTML = svgText;
    const svg = host.querySelector("svg");
    const nodes = {};
    for (const g of svg.querySelectorAll("[id]")) if (g.getAttribute("transform")) nodes[g.id] = g.getAttribute("transform");
    const edges = {};
    for (const p of svg.querySelectorAll(".edgePaths path")) {
      const d = p.getAttribute("d") || "";
      const nums = d.match(/-?\\d*\\.?\\d+(?:e[-+]?\\d+)?/gi) || [];
      edges[p.id] = { d, start: [Number(nums[0]), Number(nums[1])],
        end: [Number(nums[nums.length - 2]), Number(nums[nums.length - 1])],
        markers: !!(p.getAttribute("marker-end") || p.getAttribute("marker-start")) };
    }
    const labels = {};
    for (const g of svg.querySelectorAll("g.edgeLabel")) {
      const inner = g.querySelector("[data-id]");
      if (inner && g.textContent.trim()) labels[inner.getAttribute("data-id")] = g.getAttribute("transform") || "";
    }
    return { nodes, edges, labels };
  } finally {
    host.remove();
  }
}`;

// ---------------------------------------------------------------------------------------------
// Types returned by the page

type Dir = "TB" | "BT" | "LR" | "RL";
interface MNode {
  id: string;
  label: string;
  shape: string;
  parentId?: string;
  width: number;
  height: number;
  order: number;
}
interface MEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  labelWidth: number;
  labelHeight: number;
  pattern: string;
  /** "arrow_point", "arrow_open" (no arrowhead)… */
  type: string;
  minlen: number;
  order: number;
}
interface MCluster {
  id: string;
  title: string;
  parentId?: string;
  dir?: string;
  titleWidth: number;
  titleHeight: number;
  order: number;
}
interface Measured {
  direction: string;
  nodes: MNode[];
  edges: MEdge[];
  clusters: MCluster[];
}
interface Point {
  x: number;
  y: number;
}
interface Plan {
  archetype: string;
  nodes: Record<string, Point & { width?: number; height?: number }>;
  clusters: Record<string, Point & { width: number; height: number }>;
  edges: Record<string, { points: Point[]; curve?: string; label?: Point; exact?: boolean }>;
  /** Mermaid adds half the subgraph title margin to every edge label's y. */
  labelShift: number;
  width: number;
  height: number;
}
interface Placed {
  nodes: Record<string, { width: number; height: number; domId: string }>;
  clusters: Record<string, { width: number; height: number }>;
}
interface ReadBack {
  nodes: Record<string, string>;
  edges: Record<
    string,
    { d: string; start: [number, number]; end: [number, number]; markers: boolean }
  >;
  labels: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------
// Throwaway engine

const norm = (d: string | undefined, fallback: Dir): Dir =>
  d === "TD" ? "TB" : d === "TB" || d === "BT" || d === "LR" || d === "RL" ? d : fallback;
const horizontal = (d: Dir) => d === "LR" || d === "RL";
const snap = (v: number) => Math.round(v / GRID) * GRID;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Unit {
  id: string;
  w: number;
  h: number;
  order: number;
  /** Positions of member nodes relative to the unit's centre (clusters). */
  members: Map<string, Point>;
}

const GAP_IN_CLUSTER = 36;
const CLUSTER_PAD = 16;

function topo(ids: string[], edges: MEdge[]): string[] {
  const set = new Set(ids);
  const inner = edges.filter((e) => set.has(e.from) && set.has(e.to) && e.pattern !== "invisible");
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of inner) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const out: string[] = [];
  const queue = ids.filter((id) => indeg.get(id) === 0);
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const e of inner.filter((e) => e.from === id)) {
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  return [...out, ...ids.filter((id) => !out.includes(id))];
}

function clusterUnit(c: MCluster, g: Measured, root: Dir): Unit {
  const dir = norm(c.dir, root);
  const members = g.nodes.filter((n) => n.parentId === c.id);
  const ordered = topo(
    members.map((n) => n.id),
    g.edges,
  ).map((id) => members.find((n) => n.id === id)!);
  if (dir === "RL" || dir === "BT") ordered.reverse();
  const along = horizontal(dir);
  const contentW = along
    ? ordered.reduce((s, n) => s + n.width, 0) + GAP_IN_CLUSTER * (ordered.length - 1)
    : Math.max(...ordered.map((n) => n.width));
  const contentH = along
    ? Math.max(...ordered.map((n) => n.height))
    : ordered.reduce((s, n) => s + n.height, 0) + GAP_IN_CLUSTER * (ordered.length - 1);
  const titleBlock = c.titleHeight + SUBGRAPH_TITLE_MARGIN.top + SUBGRAPH_TITLE_MARGIN.bottom;
  const w = Math.max(contentW, c.titleWidth) + 2 * CLUSTER_PAD;
  const h = titleBlock + contentH + 2 * CLUSTER_PAD;
  const top = -h / 2 + titleBlock + CLUSTER_PAD;
  const pos = new Map<string, Point>();
  let cursor = along ? -contentW / 2 : top;
  for (const n of ordered) {
    if (along) {
      pos.set(n.id, { x: cursor + n.width / 2, y: top + contentH / 2 });
      cursor += n.width + GAP_IN_CLUSTER;
    } else {
      pos.set(n.id, { x: 0, y: cursor + n.height / 2 });
      cursor += n.height + GAP_IN_CLUSTER;
    }
  }
  return { id: c.id, w, h, order: c.order, members: pos };
}

function compose(g: Measured): Plan | { fallback: string } {
  const root = norm(g.direction, "TB");
  if (g.clusters.some((c) => c.parentId)) return { fallback: "nested subgraphs" };
  const unitOf = new Map<string, string>();
  const units: Unit[] = [];
  for (const c of g.clusters) {
    const u = clusterUnit(c, g, root);
    units.push(u);
    unitOf.set(c.id, c.id);
    for (const id of u.members.keys()) unitOf.set(id, c.id);
  }
  for (const n of g.nodes.filter((n) => !n.parentId)) {
    units.push({ id: n.id, w: n.width, h: n.height, order: n.order, members: new Map() });
    unitOf.set(n.id, n.id);
  }
  units.sort((a, b) => a.order - b.order);
  const byId = new Map(units.map((u) => [u.id, u]));
  const visible = g.edges.filter((e) => e.pattern !== "invisible");
  const unitEdges = visible
    .map((e) => ({ e, from: unitOf.get(e.from)!, to: unitOf.get(e.to)! }))
    .filter((x) => x.from !== x.to);

  // Back edges: DFS from the units in source order.
  const back = new Set<MEdge>();
  const state = new Map<string, 1 | 2>();
  const dfs = (u: string) => {
    state.set(u, 1);
    for (const x of unitEdges.filter((x) => x.from === u)) {
      const s = state.get(x.to);
      if (s === 1) back.add(x.e);
      else if (!s) dfs(x.to);
    }
    state.set(u, 2);
  };
  const hasIn = new Set(unitEdges.map((x) => x.to));
  for (const u of units.filter((u) => !hasIn.has(u.id))) if (!state.get(u.id)) dfs(u.id);
  for (const u of units) if (!state.get(u.id)) dfs(u.id);
  const forward = unitEdges.filter((x) => !back.has(x.e));

  const centre = new Map<string, Point>();
  let archetype: string;
  const chain =
    units.length >= SERPENTINE_MIN &&
    back.size === 0 &&
    forward.length === units.length - 1 &&
    units.every(
      (u) =>
        forward.filter((x) => x.from === u.id).length <= 1 &&
        forward.filter((x) => x.to === u.id).length <= 1,
    );

  if (chain) {
    // Serpentine: rows of `cols` units, every row read left to right (whatever direction the
    // chain was written in); the edge to the next row returns to its start through the gap
    // between rows, like a carriage return (the router's elbow route does that).
    const start = units.find((u) => !forward.some((x) => x.to === u.id))!;
    const seq = [start];
    while (seq.length < units.length) {
      const next = forward.find((x) => x.from === seq.at(-1)!.id);
      if (!next) break;
      seq.push(byId.get(next.to)!);
    }
    const colW = Math.max(...seq.map((u) => u.w));
    const gapX = 56;
    const gapY = 56;
    let best: { cols: number; scale: number; height: number } | undefined;
    for (let cols = 2; cols <= Math.min(5, seq.length - 1); cols++) {
      const rows = Math.ceil(seq.length / cols);
      const rowH = Array.from({ length: rows }, (_, r) =>
        Math.max(...seq.slice(r * cols, r * cols + cols).map((u) => u.h)),
      );
      const w = cols * colW + (cols - 1) * gapX;
      const h = rowH.reduce((s, v) => s + v, 0) + (rows - 1) * gapY;
      const scale = printScale({ width: w, height: h }, FIT);
      const height = h * scale;
      if (!best || scale > best.scale + 0.05 || (scale > best.scale - 0.05 && height < best.height))
        best = { cols, scale, height };
    }
    const cols = best!.cols;
    let y = 0;
    for (let r = 0; r * cols < seq.length; r++) {
      const row = seq.slice(r * cols, r * cols + cols);
      const rowH = Math.max(...row.map((u) => u.h));
      row.forEach((u, c) => {
        centre.set(u.id, { x: c * (colW + gapX) + colW / 2, y: y + rowH / 2 });
      });
      y += rowH + gapY;
    }
    archetype = `serpentine ${cols}×${Math.ceil(seq.length / cols)}`;
  } else {
    // Layers by longest path along the written direction.
    const layer = new Map<string, number>(units.map((u) => [u.id, 0]));
    for (let i = 0; i < units.length; i++)
      for (const x of forward)
        layer.set(x.to, Math.max(layer.get(x.to)!, layer.get(x.from)! + Math.max(1, x.e.minlen)));
    const layers: Unit[][] = [];
    for (const u of units) (layers[layer.get(u.id)!] ??= []).push(u);
    const across = horizontal(root);
    const gapCross = 32;
    const labelRoom = Math.max(0, ...visible.map((e) => (across ? e.labelWidth : e.labelHeight)));
    const gapMain = Math.max(56, labelRoom + 32);
    let main = 0;
    const slot = new Map<string, number>();
    for (const L of layers.filter(Boolean)) {
      // One barycentre sweep against the previous layers.
      L.sort((a, b) => {
        const bary = (u: Unit) => {
          const preds = forward.filter((x) => x.to === u.id && slot.has(x.from));
          return preds.length
            ? preds.reduce((s, x) => s + slot.get(x.from)!, 0) / preds.length
            : u.order;
        };
        return bary(a) - bary(b) || a.order - b.order;
      });
      const thick = Math.max(...L.map((u) => (across ? u.w : u.h)));
      const total = L.reduce((s, u) => s + (across ? u.h : u.w), 0) + gapCross * (L.length - 1);
      let cross = -total / 2;
      for (const u of L) {
        const size = across ? u.h : u.w;
        const c = cross + size / 2;
        slot.set(u.id, c);
        centre.set(u.id, across ? { x: main + thick / 2, y: c } : { x: c, y: main + thick / 2 });
        cross += size + gapCross;
      }
      main += thick + gapMain;
    }
    if (root === "BT" || root === "RL")
      for (const [id, p] of centre)
        centre.set(id, across ? { x: main - p.x, y: p.y } : { x: p.x, y: main - p.y });
    archetype = `layered ${layers.filter(Boolean).length} layers`;
  }

  // Snap unit centres to the grid, then place members.
  const plan: Plan = {
    archetype,
    nodes: {},
    clusters: {},
    edges: {},
    labelShift: (SUBGRAPH_TITLE_MARGIN.top + SUBGRAPH_TITLE_MARGIN.bottom) / 2,
    width: 0,
    height: 0,
  };
  const rects = new Map<string, Rect>();
  for (const u of units) {
    const p = centre.get(u.id)!;
    const c = { x: snap(p.x), y: snap(p.y) };
    rects.set(u.id, { ...c, w: u.w, h: u.h });
    if (u.members.size) {
      plan.clusters[u.id] = { ...c, width: u.w, height: u.h };
      for (const [id, m] of u.members) {
        const n = g.nodes.find((n) => n.id === id)!;
        const q = { x: c.x + m.x, y: c.y + m.y };
        plan.nodes[id] = q;
        rects.set(id, { ...q, w: n.width, h: n.height });
      }
    } else plan.nodes[u.id] = c;
  }
  const all = [...rects.values()];
  const minX = Math.min(...all.map((r) => r.x - r.w / 2));
  const maxX = Math.max(...all.map((r) => r.x + r.w / 2));
  const minY = Math.min(...all.map((r) => r.y - r.h / 2));
  const maxY = Math.max(...all.map((r) => r.y + r.h / 2));

  // Routes: straight when aligned, one elbow otherwise, back edges around the outside.
  let lane = 0;
  for (const e of g.edges) {
    const a = rects.get(e.from)!;
    const b = rects.get(e.to)!;
    const mid = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    let points: Point[];
    if (back.has(e)) {
      const off = 28 + 16 * lane++;
      points = horizontal(root)
        ? [a, { x: a.x, y: maxY + off }, { x: b.x, y: maxY + off }, b]
        : [a, { x: maxX + off, y: a.y }, { x: maxX + off, y: b.y }, b];
    } else if (Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) {
      points = [a, mid(a, b), b];
    } else if (horizontal(root) && !chain) {
      const m =
        a.x < b.x ? (a.x + a.w / 2 + b.x - b.w / 2) / 2 : (a.x - a.w / 2 + b.x + b.w / 2) / 2;
      points = [a, { x: m, y: a.y }, { x: m, y: b.y }, b];
    } else {
      const m =
        a.y < b.y ? (a.y + a.h / 2 + b.y - b.h / 2) / 2 : (a.y - a.h / 2 + b.y + b.h / 2) / 2;
      points = [a, { x: a.x, y: m }, { x: b.x, y: m }, b];
    }
    // The label sits on the middle segment of the route.
    const label = points.length === 3 ? points[1]! : mid(points[1]!, points[2]!);
    plan.edges[e.id] = {
      points: points.map((p) => ({ x: p.x, y: p.y })),
      curve: "rounded",
      ...(e.label ? { label: { x: label.x, y: label.y } } : {}),
    };
  }
  plan.width = maxX - minX;
  plan.height = maxY - minY;
  return plan;
}

// ---------------------------------------------------------------------------------------------
// Engines closer to the plan: ELK for the general case (step 7.6), the ring for cycles (7.5)

const elk = new ELK();
const ELK_DIRECTION: Record<Dir, string> = { TB: "DOWN", BT: "UP", LR: "RIGHT", RL: "LEFT" };
const FLIPPED_DIR: Record<Dir, Dir> = { TB: "LR", BT: "LR", LR: "TB", RL: "TB" };
const LABEL_SHIFT = (SUBGRAPH_TITLE_MARGIN.top + SUBGRAPH_TITLE_MARGIN.bottom) / 2;

function bounds(boxes: Rect[], points: Point[] = []): { width: number; height: number } {
  const xs = [...boxes.flatMap((b) => [b.x - b.w / 2, b.x + b.w / 2]), ...points.map((p) => p.x)];
  const ys = [...boxes.flatMap((b) => [b.y - b.h / 2, b.y + b.h / 2]), ...points.map((p) => p.y)];
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/** Layered layout by elkjs in Node, orthogonal routes and edge labels placed by ELK. */
async function composeElk(g: Measured, dir: Dir): Promise<Plan> {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": ELK_DIRECTION[dir],
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.spacing.nodeNode": "28",
      "elk.layered.spacing.nodeNodeBetweenLayers": "40",
      "elk.spacing.edgeNode": "16",
      "elk.spacing.edgeEdge": "12",
      "elk.layered.spacing.edgeNodeBetweenLayers": "16",
      "elk.spacing.edgeLabel": "4",
      "elk.edgeLabels.placement": "CENTER",
    },
    children: g.nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    edges: g.edges.map((e): ElkExtendedEdge => ({
      id: e.id,
      sources: [e.from],
      targets: [e.to],
      labels: e.label
        ? [{ id: `${e.id}-label`, text: e.label, width: e.labelWidth, height: e.labelHeight }]
        : [],
    })),
  };
  const out = await elk.layout(graph);
  const plan: Plan = {
    archetype: `layered (ELK ${dir})`,
    nodes: {},
    clusters: {},
    edges: {},
    labelShift: LABEL_SHIFT,
    width: 0,
    height: 0,
  };
  const boxes = new Map<string, Rect>();
  for (const c of out.children ?? []) {
    const box = { x: c.x! + c.width! / 2, y: c.y! + c.height! / 2, w: c.width!, h: c.height! };
    boxes.set(c.id, box);
    plan.nodes[c.id] = { x: box.x, y: box.y };
  }
  const extra: Point[] = [];
  for (const e of (out.edges ?? []) as ElkExtendedEdge[]) {
    const s = e.sections?.[0];
    const a = boxes.get(e.sources[0]!)!;
    const b = boxes.get(e.targets[0]!)!;
    const route = s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint] : [];
    // ELK's route starts and ends on the borders: drawn as given (exact), no centres added.
    const points = route.length
      ? route.map((p) => ({ x: p.x, y: p.y }))
      : [
          { x: a.x, y: a.y },
          { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          { x: b.x, y: b.y },
        ];
    const l = e.labels?.[0];
    const label = l ? { x: l.x! + l.width! / 2, y: l.y! + l.height! / 2 } : undefined;
    if (l) extra.push({ x: l.x!, y: l.y! }, { x: l.x! + l.width!, y: l.y! + l.height! });
    extra.push(...points);
    plan.edges[e.id] = {
      points,
      curve: "rounded",
      exact: route.length > 0,
      ...(label ? { label } : {}),
    };
  }
  Object.assign(plan, bounds([...boxes.values()], extra));
  return plan;
}

/** Strongly connected components (Tarjan). */
function sccs(ids: string[], edges: MEdge[]): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  const out: string[][] = [];
  const visit = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    on.add(v);
    for (const e of edges.filter((e) => e.from === v)) {
      if (!idx.has(e.to)) {
        visit(e.to);
        low.set(v, Math.min(low.get(v)!, low.get(e.to)!));
      } else if (on.has(e.to)) low.set(v, Math.min(low.get(v)!, idx.get(e.to)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      out.push(comp);
    }
  };
  for (const id of ids) if (!idx.has(id)) visit(id);
  return out;
}

/** The ring of a flywheel diagram (§4.4 rule 3 of the specification), or undefined. */
function flywheelRing(g: Measured): string[] | undefined {
  if (g.clusters.length) return undefined;
  const edges = g.edges.filter((e) => e.pattern !== "invisible" && e.from !== e.to);
  const comp = sccs(
    g.nodes.map((n) => n.id),
    edges,
  ).sort((a, b) => b.length - a.length)[0];
  if (!comp || comp.length < 3 || comp.length > 8 || comp.length < 0.65 * g.nodes.length) return;
  const inside = new Set(comp);
  const internal = edges.filter((e) => inside.has(e.from) && inside.has(e.to));
  if ((2 * internal.length) / comp.length > 2.4) return undefined;
  const order = (id: string) => g.nodes.find((n) => n.id === id)!.order;
  const byOrder = (a: string, b: string) => order(a) - order(b);
  const entered = comp.filter((id) => edges.some((e) => e.to === id && !inside.has(e.from)));
  const start = (entered.length ? entered : comp).sort(byOrder)[0]!;
  const ring = [start];
  for (;;) {
    const next = internal
      .filter((e) => e.from === ring.at(-1) && !ring.includes(e.to))
      .sort((a, b) => a.order - b.order)[0];
    if (!next) break;
    ring.push(next.to);
  }
  const closes = internal.some((e) => e.from === ring.at(-1) && e.to === start);
  return ring.length === comp.length && closes ? ring : undefined;
}

const gapBetween = (a: Rect, b: Rect) =>
  Math.max(Math.abs(a.x - b.x) - (a.w + b.w) / 2, Math.abs(a.y - b.y) - (a.h + b.h) / 2);

/** Ring layout: the cycle on an ellipse, clockwise from 12 o'clock; other nodes outside. */
function composeFlywheel(g: Measured, ring: string[], ratio: number): Plan {
  const node = (id: string) => g.nodes.find((n) => n.id === id)!;
  const edges = g.edges.filter((e) => e.from !== e.to);
  const k = ring.length;
  const theta = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / k;
  const at = new Map(ring.map((id, i) => [id, i]));
  const ringEdge = (e: MEdge) =>
    at.has(e.from) && at.has(e.to) && (at.get(e.from)! + 1) % k === at.get(e.to)!;
  const reverseEdge = (e: MEdge) =>
    at.has(e.from) && at.has(e.to) && (at.get(e.to)! + 1) % k === at.get(e.from)!;
  const outward = (angle: number, w: number, h: number) =>
    Math.abs(Math.cos(angle)) * (w / 2) + Math.abs(Math.sin(angle)) * (h / 2);

  let boxes = new Map<string, Rect>();
  let labels = new Map<string, Rect>();
  let rx = 0;
  let ry = 0;
  const arc = (from: number, to: number, scale: number, steps = 12): Point[] => {
    const pts: Point[] = [];
    for (let s = 1; s < steps; s++) {
      const t = from + ((to - from) * s) / steps;
      pts.push({ x: rx * scale * Math.cos(t), y: ry * scale * Math.sin(t) });
    }
    return pts;
  };
  const free = (p: Point, ...rects: Rect[]) =>
    rects.every((r) => Math.abs(p.x - r.x) > r.w / 2 + 4 || Math.abs(p.y - r.y) > r.h / 2 + 4);
  for (ry = 60; ry < 3000; ry += 6) {
    rx = ry * ratio;
    boxes = new Map(
      ring.map((id, i) => {
        const n = node(id);
        return [
          id,
          { x: rx * Math.cos(theta(i)), y: ry * Math.sin(theta(i)), w: n.width, h: n.height },
        ];
      }),
    );
    labels = new Map();
    for (const e of edges.filter((e) => e.label && (ringEdge(e) || reverseEdge(e)))) {
      const i = at.get(e.from)!;
      const forward = ringEdge(e);
      const mid = forward ? theta(i) + Math.PI / k : theta(i) - Math.PI / k;
      const scale = forward ? 1 : 0.6;
      const p = { x: rx * scale * Math.cos(mid), y: ry * scale * Math.sin(mid) };
      const d = (outward(mid, e.labelWidth, e.labelHeight) + 8) * (forward ? 1 : -1);
      labels.set(e.id, {
        x: p.x + Math.cos(mid) * d,
        y: p.y + Math.sin(mid) * d,
        w: e.labelWidth,
        h: e.labelHeight,
      });
    }
    const all = [...boxes.values(), ...labels.values()];
    const apart = all.every((a, i) => all.slice(i + 1).every((b) => gapBetween(a, b) >= 20));
    const arcsClear = edges.filter(ringEdge).every((e) => {
      const i = at.get(e.from)!;
      const pts = arc(theta(i), theta(i) + (2 * Math.PI) / k, 1);
      const others = [...boxes.entries()].filter(([id]) => id !== e.from && id !== e.to);
      return pts.every((p) => free(p, ...others.map(([, r]) => r)));
    });
    if (apart && arcsClear) break;
  }

  // Nodes off the ring, placed outwards from their ring neighbours.
  const placed = new Set(ring);
  for (let pass = 0; pass < g.nodes.length && placed.size < g.nodes.length; pass++) {
    for (const n of g.nodes.filter((n) => !placed.has(n.id))) {
      const links = edges.filter(
        (e) => (e.from === n.id && placed.has(e.to)) || (e.to === n.id && placed.has(e.from)),
      );
      if (!links.length) continue;
      const anchors = links.map((e) => boxes.get(e.from === n.id ? e.to : e.from)!);
      const cx = anchors.reduce((s, r) => s + r.x, 0) / anchors.length;
      const cy = anchors.reduce((s, r) => s + r.y, 0) / anchors.length;
      const angle = Math.atan2(cy / ry, cx / rx);
      const label = Math.max(
        0,
        ...links.map((e) => outward(angle, e.labelWidth, e.labelHeight) * 2),
      );
      let dist =
        outward(angle, anchors[0]!.w, anchors[0]!.h) +
        40 +
        label +
        outward(angle, n.width, n.height);
      let box: Rect;
      for (;;) {
        box = {
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          w: n.width,
          h: n.height,
        };
        const clear = [...boxes.values(), ...labels.values()].every(
          (r) => gapBetween(r, box) >= 20,
        );
        if (clear || dist > 4000) break;
        dist += 12;
      }
      boxes.set(n.id, box);
      placed.add(n.id);
    }
  }
  for (const n of g.nodes.filter((n) => !placed.has(n.id)))
    boxes.set(n.id, { x: 0, y: ry + 200, w: n.width, h: n.height });

  const plan: Plan = {
    archetype: `flywheel ${k} (Rx/Ry ${ratio})`,
    nodes: {},
    clusters: {},
    edges: {},
    labelShift: LABEL_SHIFT,
    width: 0,
    height: 0,
  };
  for (const [id, b] of boxes) plan.nodes[id] = { x: b.x, y: b.y };
  const extra: Point[] = [];
  for (const e of edges) {
    const a = boxes.get(e.from)!;
    const b = boxes.get(e.to)!;
    let points: Point[];
    let label: Point | undefined;
    let curve = "catmullRom";
    if (ringEdge(e) || reverseEdge(e)) {
      const i = at.get(e.from)!;
      const forward = ringEdge(e);
      const end = forward ? theta(i) + (2 * Math.PI) / k : theta(i) - (2 * Math.PI) / k;
      const inner = arc(theta(i), end, forward ? 1 : 0.6, 16).filter((p) => free(p, a, b));
      points = [a, ...(inner.length ? inner : [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]), b];
      const l = labels.get(e.id);
      if (l) label = { x: l.x, y: l.y };
    } else if (at.has(e.from) && at.has(e.to)) {
      const m = { x: ((a.x + b.x) / 2) * 0.5, y: ((a.y + b.y) / 2) * 0.5 };
      points = [a, m, b];
      if (e.label) label = m;
    } else {
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      points = [a, m, b];
      curve = "rounded";
      if (e.label) label = m;
    }
    extra.push(...points);
    plan.edges[e.id] = {
      points: points.map((p) => ({ x: p.x, y: p.y })),
      curve,
      ...(label ? { label } : {}),
    };
  }
  const labelBoxes = g.edges
    .filter((e) => e.label && plan.edges[e.id]?.label)
    .map((e) => ({ ...plan.edges[e.id]!.label!, w: e.labelWidth, h: e.labelHeight }));
  Object.assign(plan, bounds([...boxes.values(), ...labelBoxes], extra));
  return plan;
}

/** The engine the rules choose, in every variant worth trying (axis, ring proportion). */
async function candidates(g: Measured, flip: boolean): Promise<Plan[] | { fallback: string }> {
  const root = norm(g.direction, "TB");
  if (g.edges.some((e) => e.from === e.to)) return { fallback: "self loop" };
  const basic = compose(g);
  if ("fallback" in basic) return basic;
  if (g.clusters.length || basic.archetype.startsWith("serpentine")) return [basic];
  const ring = flywheelRing(g);
  if (ring) return [1, 1.25, 1.5].map((ratio) => composeFlywheel(g, ring, ratio));
  const dirs = flip ? [root, FLIPPED_DIR[root]] : [root];
  return Promise.all(dirs.map((d) => composeElk(g, d)));
}

/** As classic autofit: the largest print scale (within 0.05), then the shortest print. */
function best<T extends { scale: number; height: number }>(items: T[]): T {
  const top = Math.max(...items.map((c) => c.scale));
  return items
    .filter((c) => c.scale >= top - 0.05)
    .sort((a, b) => a.height * a.scale - b.height * b.scale)[0]!;
}

// ---------------------------------------------------------------------------------------------
// Run

function config(extra: Record<string, unknown> = {}, layout?: string, wrap?: number) {
  const fontFamily = fontStack("manrope");
  return {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily,
    fontSize: FONT_PX,
    themeVariables: {
      ...mermaidThemeVariables("antigravity"),
      fontFamily,
      fontSize: `${FONT_PX}px`,
    },
    htmlLabels: true,
    themeCSS: MERMAID_THEME_CSS,
    sequence: { mirrorActors: false },
    flowchart: {
      subGraphTitleMargin: SUBGRAPH_TITLE_MARGIN,
      ...(wrap === undefined ? {} : { wrappingWidth: wrap }),
    },
    ...extra,
    ...(layout ? { layout } : {}),
  };
}

const session = await BrowserSession.open(findBrowser(process.env.MDRENDER_BROWSER));
/** Optional argument: a Markdown file whose flowcharts are used instead of the corpus. */
const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
/** --dump: also write every candidate's SVG for the blind gallery (docs/prototipos/galeria_ciega). */
const dump = args.includes("--dump");
interface Dumped {
  svg: string;
  label: string;
  scale: number;
  height: number;
}
const dumped: { title: string; candidates: Record<string, Dumped> }[] = [];
const dumpedOf = (svg: string, label: string): Dumped => {
  const c = candidate(svg, undefined, false, FIT)!;
  return { svg, label, scale: c.scale, height: Math.round(c.height * c.scale) };
};
const suffix = input ? `-${basename(input, ".md")}` : "";
const cases = input ? fromFile(input) : corpus();
if (!input) {
  const case8 = cases.find((c) => c.title.startsWith("8."))!;
  for (const x of EXTRA) cases.push(x.source ? x : { ...x, source: case8.source });
}

const page = await session.newPage();
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss("manrope")}
body { margin: 0; width: ${FIT.width}px; font-family: ${fontStack("manrope")}; }</style></head><body></body></html>`,
);
await page.evaluate(readTextAsset(MERMAID_JS));
await page.evaluate(
  `globalThis.mdrFillProbe = ${FILL_PROBE}; globalThis.mdrReadBack = ${READ_BACK};
   mermaid.registerLayoutLoaders([${MEASURE_LAYOUT}, ${PLACE_LAYOUT}]);`,
);
await page.evaluate(
  `Promise.all(["400", "600", "700"].map((w) => document.fonts.load(w + ' 16px "Manrope"')))`,
);

type RenderOut = { svg: string; measured?: Measured; placed?: Placed } | { error: string };
const render = (source: string, id: string, cfg: Record<string, unknown>, plan?: Plan) =>
  page.evaluate(
    async (source: string, id: string, cfg: Record<string, unknown>, plan: Plan | null) => {
      const g = globalThis as unknown as {
        mermaid: {
          initialize(c: Record<string, unknown>): void;
          render(id: string, s: string): Promise<{ svg: string }>;
        };
        mdrFillProbe(svg: string): string;
        mdrPlan: Plan | null;
        mdrMeasured?: Measured;
        mdrPlaced?: Placed;
      };
      g.mdrPlan = plan;
      g.mdrMeasured = undefined;
      g.mdrPlaced = undefined;
      g.mermaid.initialize(cfg);
      try {
        const { svg } = await g.mermaid.render(id, source);
        return { svg: g.mdrFillProbe(svg), measured: g.mdrMeasured, placed: g.mdrPlaced };
      } catch (error) {
        return { error: String((error as Error)?.message ?? error) };
      }
    },
    source,
    id,
    cfg,
    plan ?? null,
  ) as Promise<RenderOut>;
const readBack = (svg: string) =>
  page.evaluate(
    (svg: string) =>
      (globalThis as unknown as { mdrReadBack(s: string): ReadBack }).mdrReadBack(svg),
    svg,
  );

interface Row {
  title: string;
  archetype: string;
  stable: boolean;
  sizesKept: boolean;
  positionsKept: boolean;
  clustersKept: boolean;
  edgesDrawn: string;
  clipped: boolean;
  markers: boolean;
  rounded: boolean;
  labels: string;
  finish: string;
  classic: { scale: number; height: number };
  smart?: { scale: number; height: number };
  ms: { classic: number; smart: number };
  error?: string;
  notes: string[];
}

const rows: Row[] = [];
const gallery: string[] = [];
for (const [i, c] of cases.entries()) {
  const block: MermaidBlock = { source: c.source, line: 1 } as MermaidBlock;
  let t = performance.now();
  const [classicResult] = await renderMermaid(session, [block], {
    theme: "base",
    themeVariables: mermaidThemeVariables("antigravity"),
    widthPx: FIT.width,
    fontPx: FONT_PX,
    pageHeightPx: FIT.height,
  });
  const classicMs = performance.now() - t;
  if (!classicResult || "error" in classicResult) throw new Error(`classic failed: ${c.title}`);
  // The classic render can be given a different look only through the source; for E3 draw it
  // with the same extra configuration so both columns compare like with like.
  let classicSvg = classicResult.svg;
  if (c.config) {
    const r = await render(c.source, `classic-x-${i}`, config(c.config));
    if ("error" in r) throw new Error(r.error);
    classicSvg = finishDiagram(r.svg);
  }
  const classicSize = measureSvg(classicSvg)!;
  const classicScale = printScale(classicSize, FIT);
  const turned = classicResult.layout?.turned;
  const entry = dump ? { title: c.title, candidates: {} as Record<string, Dumped> } : undefined;
  if (entry) {
    dumped.push(entry);
    entry.candidates.classic = dumpedOf(
      classicSvg,
      `classic${turned ? ` (autofit giró ${turned})` : ""}`,
    );
    const header = flowchartHeader(c.source);
    if (header && !c.config) {
      // The other axis than the one classic chose: written if autofit turned it, turned if not.
      const source = turned
        ? c.source
        : withDirection(c.source, header, flippedDirection(header.direction));
      const [other] = await renderMermaid(session, [{ source, line: 1 } as MermaidBlock], {
        theme: "base",
        themeVariables: mermaidThemeVariables("antigravity"),
        widthPx: FIT.width,
        fontPx: FONT_PX,
        pageHeightPx: FIT.height,
        flip: "never",
      });
      if (other && "svg" in other)
        entry.candidates.classicAlt = dumpedOf(
          other.svg,
          turned ? "classic en su dirección escrita" : "classic girado",
        );
    }
  }
  const row: Row = {
    title: c.title,
    archetype: "",
    stable: false,
    sizesKept: false,
    positionsKept: false,
    clustersKept: false,
    edgesDrawn: "",
    clipped: false,
    markers: false,
    rounded: false,
    labels: "",
    finish: "",
    classic: { scale: classicScale, height: Math.round(classicSize.height * classicScale) },
    ms: { classic: Math.round(classicMs), smart: 0 },
    notes: [],
  };
  rows.push(row);

  t = performance.now();
  const m1 = await render(c.source, `measure-${i}-a`, config(c.config, "mdr-measure"));
  const m2 = await render(c.source, `measure-${i}-b`, config(c.config, "mdr-measure"));
  if ("error" in m1 || "error" in m2 || !m1.measured || !m2.measured) {
    row.error = "error" in m1 ? m1.error : "error" in m2 ? m2.error : "nothing measured";
    continue;
  }
  row.stable = JSON.stringify(m1.measured) === JSON.stringify(m2.measured);
  // Candidates: Mermaid's wrapping and two wider ones (§5.3), each with the variants of the
  // chosen engine; scored in Node, and only the best one is drawn.
  const tried: { plan: Plan; measured: Measured; wrap?: number; scale: number; height: number }[] =
    [];
  let fallback: string | undefined;
  for (const wrap of [undefined, 200, 300]) {
    const m =
      wrap === undefined
        ? m1
        : await render(c.source, `measure-${i}-${wrap}`, config(c.config, "mdr-measure", wrap));
    if ("error" in m || !m.measured) continue;
    const plans = await candidates(m.measured, true);
    if ("fallback" in plans) {
      fallback = plans.fallback;
      break;
    }
    for (const plan of plans)
      tried.push({
        plan,
        measured: m.measured,
        wrap,
        scale: printScale(plan, FIT),
        height: plan.height,
      });
  }
  if (fallback || !tried.length) {
    row.error = `fallback: ${fallback ?? "no candidate"}`;
    continue;
  }
  const chosen = best(tried);
  const { plan, measured, wrap } = chosen;
  row.archetype = `${plan.archetype}, wrap ${wrap ?? "Mermaid"}, ${tried.length} candidatos`;
  const placedOut = await render(c.source, `smart-${i}`, config(c.config, "mdr-place", wrap), plan);
  row.ms.smart = Math.round(performance.now() - t);
  if ("error" in placedOut || !placedOut.placed) {
    row.error = "error" in placedOut ? placedOut.error : "nothing placed";
    continue;
  }
  const placed = placedOut.placed;
  const svg = finishDiagram(placedOut.svg);
  const back = await readBack(svg);

  // Sizes: what mdr-place drew equals what mdr-measure measured.
  row.sizesKept = measured.nodes.every((n) => {
    const p = placed.nodes[n.id];
    return p && Math.abs(p.width - n.width) < 0.5 && Math.abs(p.height - n.height) < 0.5;
  });
  // Positions: each node's transform is the plan's.
  row.positionsKept = measured.nodes.every((n) => {
    const p = plan.nodes[n.id]!;
    const tr = back.nodes[placed.nodes[n.id]!.domId] ?? "";
    const mm = /translate\(\s*(-?[\d.]+(?:e[-+]?\d+)?)[\s,]+(-?[\d.]+(?:e[-+]?\d+)?)/.exec(tr);
    const ok = !!mm && Math.abs(Number(mm[1]) - p.x) < 0.5 && Math.abs(Number(mm[2]) - p.y) < 0.5;
    if (!ok) row.notes.push(`nodo ${n.id}: plan (${p.x}, ${p.y}), dibujado "${tr}"`);
    return ok;
  });
  row.clustersKept = measured.clusters.every((cl) => {
    const p = plan.clusters[cl.id]!;
    const q = placed.clusters[cl.id]!;
    const ok = Math.abs(p.width - q.width) < 0.5 && Math.abs(p.height - q.height) < 0.5;
    if (!ok)
      row.notes.push(
        `subgrafo ${cl.id}: plan ${p.width}×${p.height}, dibujado ${q.width}×${q.height}`,
      );
    return ok;
  });
  // Edges: one path per edge (invisible ones included), ends on the shapes' borders.
  const paths = Object.entries(back.edges);
  row.edgesDrawn = `${paths.length}/${measured.edges.length}`;
  const rectOf = (id: string) => {
    const n = measured.nodes.find((n) => n.id === id);
    if (n) return { ...plan.nodes[id]!, w: n.width, h: n.height };
    const cl = plan.clusters[id]!;
    return { x: cl.x, y: cl.y, w: cl.width, h: cl.height };
  };
  // Unclipped means the path still starts or ends near the shape's centre. (The border of a
  // slanted or round shape lies inside its bounding box, so the box itself is no test.)
  const inside = (pt: [number, number], r: Rect) =>
    Math.abs(pt[0] - r.x) < r.w * 0.3 && Math.abs(pt[1] - r.y) < r.h * 0.3;
  const drawnEdges = measured.edges.filter((e) => e.pattern !== "invisible");
  row.clipped = drawnEdges.every((e) => {
    const p = paths.find(([id]) => id.endsWith(e.id))?.[1];
    const a = rectOf(e.from);
    const b = rectOf(e.to);
    const ok = !!p && !inside(p.start, a) && !inside(p.end, b);
    if (!ok && p) {
      const shape = (id: string) => measured.nodes.find((n) => n.id === id)?.shape ?? "subgrafo";
      row.notes.push(
        `arista ${e.id} (${shape(e.from)} → ${shape(e.to)}): empieza en (${p.start.map(Math.round).join(", ")}) ` +
          `con origen centrado en (${a.x}, ${a.y}) ${a.w}×${a.h}; termina en (${p.end.map(Math.round).join(", ")}) ` +
          `con destino en (${b.x}, ${b.y}) ${b.w}×${b.h}`,
      );
    }
    return ok;
  });
  row.markers = drawnEdges
    .filter((e) => e.type !== "arrow_open")
    .every((e) => paths.find(([id]) => id.endsWith(e.id))?.[1].markers);
  row.rounded = drawnEdges
    .filter((e) => plan.edges[e.id]?.curve === "rounded")
    .every((e) => !/C/.test(paths.find(([id]) => id.endsWith(e.id))?.[1].d ?? "C"));
  const labelled = measured.edges.filter((e) => e.label);
  const labelsAt = labelled.filter((e) => {
    const want = plan.edges[e.id]!.label!;
    const mm = /translate\(\s*(-?[\d.]+(?:e[-+]?\d+)?)[\s,]+(-?[\d.]+(?:e[-+]?\d+)?)/.exec(
      back.labels[e.id] ?? "",
    );
    const ok = !!mm && Math.abs(Number(mm[1]) - want.x) < 1 && Math.abs(Number(mm[2]) - want.y) < 1;
    if (!ok)
      row.notes.push(
        `etiqueta de ${e.id}: plan (${want.x}, ${want.y}), dibujada "${back.labels[e.id] ?? ""}"`,
      );
    return ok;
  }).length;
  row.labels = `${labelsAt}/${labelled.length}`;
  const gradients = (svg.match(/<linearGradient /g) ?? []).length;
  const heads = (svg.match(/class="cluster-head"/g) ?? []).length;
  const polygons = (svg.match(/<polygon\b[^>]*label-container/g) ?? []).length;
  row.finish = `${gradients} degr., ${heads}/${measured.clusters.length} bandas, ${polygons} polígonos sin redondear`;
  const smartCandidate = candidate(svg, undefined, false, FIT)!;
  row.smart = {
    scale: smartCandidate.scale,
    height: Math.round(smartCandidate.height * smartCandidate.scale),
  };
  if (entry) {
    entry.candidates.smart = dumpedOf(svg, row.archetype);
    // Alternative smart: ELK on the other axis when the rule chose ELK, else ELK itself.
    let alts: typeof tried = [];
    if (plan.archetype.startsWith("layered (ELK"))
      alts = tried.filter((t) => t.plan.archetype !== plan.archetype);
    else if (!measured.clusters.length) {
      const byWrap = new Map(tried.map((t) => [t.wrap, t.measured]));
      for (const [w, m] of byWrap) {
        const root = norm(m.direction, "TB");
        for (const d of [root, FLIPPED_DIR[root]]) {
          const alt = await composeElk(m, d);
          alts.push({
            plan: alt,
            measured: m,
            wrap: w,
            scale: printScale(alt, FIT),
            height: alt.height,
          });
        }
      }
    }
    if (alts.length) {
      const alt = best(alts);
      const out = await render(
        c.source,
        `smart-alt-${i}`,
        config(c.config, "mdr-place", alt.wrap),
        alt.plan,
      );
      if (!("error" in out))
        entry.candidates.smartAlt = dumpedOf(
          finishDiagram(out.svg),
          `${alt.plan.archetype}, wrap ${alt.wrap ?? "Mermaid"}`,
        );
    }
  }
  gallery.push(`<section><h2>${c.title}</h2><p>${plan.archetype}</p><div class="pair">
<figure><figcaption>classic · escala ${row.classic.scale.toFixed(2)} · alto ${row.classic.height} px</figcaption>${classicSvg}</figure>
<figure><figcaption>smart · escala ${row.smart.scale.toFixed(2)} · alto ${row.smart.height} px</figcaption>${svg}</figure>
</div></section>`);
}

// Does Mermaid honour a node size given to insertNode? (for equalising sibling nodes later)
const sizeCase = cases[0]!;
const sizeMeasure = await render(sizeCase.source, "size-m", config({}, "mdr-measure"));
let sizeHonoured = "not tried";
if (!("error" in sizeMeasure) && sizeMeasure.measured) {
  const plan = compose(sizeMeasure.measured);
  if (!("fallback" in plan)) {
    for (const n of sizeMeasure.measured.nodes)
      plan.nodes[n.id] = { ...plan.nodes[n.id]!, width: n.width + 80, height: n.height + 20 };
    const out = await render(sizeCase.source, "size-p", config({}, "mdr-place"), plan);
    if (!("error" in out) && out.placed) {
      const ok = sizeMeasure.measured.nodes.filter((n) => {
        const p = out.placed!.nodes[n.id]!;
        return Math.abs(p.width - (n.width + 80)) < 1 && Math.abs(p.height - (n.height + 20)) < 1;
      }).length;
      const off = sizeMeasure.measured.nodes
        .filter((n) => {
          const p = out.placed!.nodes[n.id]!;
          return (
            Math.abs(p.width - (n.width + 80)) >= 1 || Math.abs(p.height - (n.height + 20)) >= 1
          );
        })
        .map((n) => {
          const p = out.placed!.nodes[n.id]!;
          return `${n.id} ${n.shape}: pedido ${Math.round(n.width + 80)}×${Math.round(n.height + 20)}, dibujado ${Math.round(p.width)}×${Math.round(p.height)}`;
        });
      sizeHonoured = `${ok}/${sizeMeasure.measured.nodes.length} nodos con el tamaño pedido (${off.join("; ")})`;
    } else sizeHonoured = "error" in out ? `error: ${out.error}` : "nothing placed";
  }
}
await page.close();

// Gallery: as printed (scaled to the column and the page height).
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${fontFaceCss("manrope")}
body { margin: 24px; font-family: ${fontStack("manrope")}; color: #1d1d1f; width: ${2 * FIT.width + 48}px; }
h2 { font-size: 15px; margin: 28px 0 2px; } p { margin: 0 0 8px; font-size: 12px; color: #666; }
.pair { display: flex; gap: 24px; align-items: flex-start; }
figure { margin: 0; width: ${FIT.width}px; text-align: center; outline: 1px dashed #ccc; }
figcaption { font-size: 11px; color: #666; text-align: left; padding: 2px 4px; }
figure svg { max-width: 100%; max-height: ${FIT.height}px; height: auto; }
foreignObject p { margin: 0; }
</style></head><body>${gallery.join("\n")}</body></html>`;
const shot = await session.newPage();
await shot.setViewport({ width: 2 * FIT.width + 96, height: 900, deviceScaleFactor: 1 });
await shot.setContent(html);
await shot.screenshot({
  path: join(here, `galeria${suffix}.png`) as `${string}.png`,
  fullPage: true,
});
const pdf = Buffer.from(
  await shot.pdf({ width: `${2 * FIT.width + 96}px`, printBackground: true }),
);
writeFileSync(join(tmpdir(), "mdr-poc-galeria.pdf"), pdf);
const images = (pdf.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
await shot.close();
await session.close();

// Results
const yes = (b: boolean) => (b ? "sí" : "**NO**");
const lines = [
  "# Prueba de concepto 7.1 — resultados",
  "",
  `Generado por \`poc.mts\` con Mermaid ${JSON.parse(readFileSync(join(repo, "node_modules/mermaid/package.json"), "utf8")).version}. ` +
    `Columna de ${FIT.width} px y alto útil de ${FIT.height} px (A4, márgenes de 20 mm).`,
  "",
  "| Caso | Arquetipo | Medición estable | Tamaños | Posiciones | Subgrafos | Aristas | Recortadas | Flechas | `rounded` por arista | Etiquetas | Acabado | Escala classic → smart | Alto classic → smart | ms classic / smart |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((r) =>
    r.error
      ? `| ${r.title} | — | ${yes(r.stable)} | | | | | | | | | | | | **${r.error}** |`
      : `| ${r.title} | ${r.archetype} | ${yes(r.stable)} | ${yes(r.sizesKept)} | ${yes(r.positionsKept)} | ${yes(r.clustersKept)} | ${r.edgesDrawn} | ${yes(r.clipped)} | ${yes(r.markers)} | ${yes(r.rounded)} | ${r.labels} | ${r.finish} | ${r.classic.scale.toFixed(2)} → ${r.smart!.scale.toFixed(2)} | ${r.classic.height} → ${r.smart!.height} | ${r.ms.classic} / ${r.ms.smart} |`,
  ),
  "",
  ...rows
    .filter((r) => r.notes.length)
    .flatMap((r) => [`**${r.title}**`, "", ...r.notes.map((n) => `- ${n}`), ""]),
  `- Tamaño de nodo dado antes de \`insertNode\`: ${sizeHonoured}.`,
  `- Imágenes rasterizadas en el PDF de la galería: ${images}.`,
  "",
];
writeFileSync(join(here, `resultados${suffix}.md`), lines.join("\n"));
if (dump) {
  const dir = join(repo, "docs/prototipos/galeria_ciega/candidatos");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `candidatos${suffix || "-corpus"}.json`), JSON.stringify(dumped));
}
console.log(lines.join("\n"));

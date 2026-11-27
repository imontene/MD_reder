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
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  flowchartHeader,
  measureSvg,
  printScale,
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

// ---------------------------------------------------------------------------------------------
// Cases

interface Case {
  title: string;
  source: string;
  /** Extra Mermaid configuration for both renders (e.g. a look). */
  config?: Record<string, unknown>;
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
    const paths = h.insertEdge(edgePathsG, e, new Map(), data.type, byId.get(e.start), byId.get(e.end), data.diagramId);
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
  edges: Record<string, { points: Point[]; curve?: string; label?: Point }>;
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
    units.length >= 5 &&
    back.size === 0 &&
    forward.length === units.length - 1 &&
    units.every(
      (u) =>
        forward.filter((x) => x.from === u.id).length <= 1 &&
        forward.filter((x) => x.to === u.id).length <= 1,
    );

  if (chain) {
    // Serpentine: rows of `cols` units, alternate rows run backwards.
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
        let col = r % 2 ? cols - 1 - c : c;
        if (root === "RL") col = cols - 1 - col;
        centre.set(u.id, { x: col * (colW + gapX) + colW / 2, y: y + rowH / 2 });
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
// Run

function config(extra: Record<string, unknown> = {}, layout?: string) {
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
    flowchart: { subGraphTitleMargin: SUBGRAPH_TITLE_MARGIN },
    ...extra,
    ...(layout ? { layout } : {}),
  };
}

const session = await BrowserSession.open(findBrowser(process.env.MDRENDER_BROWSER));
const cases = corpus();
const case8 = cases.find((c) => c.title.startsWith("8."))!;
for (const x of EXTRA) cases.push(x.source ? x : { ...x, source: case8.source });

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
  const measured = m1.measured;
  const plan = compose(measured);
  if ("fallback" in plan) {
    row.error = `fallback: ${plan.fallback}`;
    continue;
  }
  row.archetype = plan.archetype;
  const placedOut = await render(c.source, `smart-${i}`, config(c.config, "mdr-place"), plan);
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
    const mm = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(tr);
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
  row.rounded = drawnEdges.every(
    (e) => !/C/.test(paths.find(([id]) => id.endsWith(e.id))?.[1].d ?? "C"),
  );
  const labelled = measured.edges.filter((e) => e.label);
  const labelsAt = labelled.filter((e) => {
    const want = plan.edges[e.id]!.label!;
    const mm = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(back.labels[e.id] ?? "");
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
await shot.screenshot({ path: join(here, "galeria.png") as `${string}.png`, fullPage: true });
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
writeFileSync(join(here, "resultados.md"), lines.join("\n"));
console.log(lines.join("\n"));

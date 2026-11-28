// Measures every drawing of the blind gallery (pagina/pares.json, exactly as voted) with the
// criterion of §5.3 of docs/ESPECIFICACION_MERMAID_LAYOUT.md, in a browser page with the
// document fonts. Writes medidas.json next to this file.
//   npx tsx docs/prototipos/galeria_ciega/medidas.mts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findBrowser } from "../../../src/browser/detect.ts";
import { BrowserSession } from "../../../src/render/browser.ts";

const here = dirname(fileURLToPath(import.meta.url));
/** A4 with 20 mm margins: text column and usable height (as poc.mts). */
const FIT = { width: 642, height: Math.round(((297 - 40 - 6) * 96) / 25.4) };

export interface Measures {
  scale: number;
  printedHeight: number;
  // Criterion measures (0 is ideal, negative is worse)
  legibility: number;
  economy: number;
  proportion: number;
  balance: number;
  contact: number;
  exits: number;
  returns: number;
  crossings: number;
  // Hard-condition counts
  nodeOverlaps: number;
  edgesThroughBoxes: number;
  looseEnds: number;
}

/** Runs in the page: geometry of one rendered Mermaid flowchart, in its root user space. */
const MEASURE = `(svgText, fitW, fitH) => {
  const host = document.createElement("div");
  host.style.width = fitW + "px";
  document.body.appendChild(host);
  try {
    host.innerHTML = svgText;
    const svg = host.querySelector("svg");
    const vb = svg.viewBox.baseVal;
    const W = vb.width, H = vb.height;
    const scale = Math.min(1, fitW / W, fitH / H);
    const rootInv = svg.getCTM().inverse();
    const toRoot = (el) => rootInv.multiply(el.getCTM());
    const map = (m, x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(m); return [q.x, q.y]; };
    const boxOf = (el) => {
      const b = el.getBBox(), m = toRoot(el);
      const c = [map(m, b.x, b.y), map(m, b.x + b.width, b.y), map(m, b.x, b.y + b.height), map(m, b.x + b.width, b.y + b.height)];
      const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
    const cx = (b) => (b.x0 + b.x1) / 2, cy = (b) => (b.y0 + b.y1) / 2;
    const inside = (p, b, pad) => p[0] > b.x0 + pad && p[0] < b.x1 - pad && p[1] > b.y0 + pad && p[1] < b.y1 - pad;
    const overlap = (a, b, pad) => a.x0 + pad < b.x1 && b.x0 + pad < a.x1 && a.y0 + pad < b.y1 && b.y0 + pad < a.y1;

    const nodes = new Map();
    for (const g of svg.querySelectorAll("g.node, g.rough-node")) {
      const m = /flowchart-(.+)-\\d+$/.exec(g.id || "");
      if (!m) continue;
      const shapes = [...g.querySelectorAll("rect, polygon, path, circle, ellipse")].filter((s) => !s.closest("foreignObject"));
      nodes.set(m[1], { box: boxOf(g), shapes });
    }
    const ids = [...nodes.keys()];
    const endsOf = (id) => {
      const m = /L_(.+)_\\d+$/.exec(id || "");
      if (!m) return null;
      for (const a of ids) if (m[1].startsWith(a + "_") && nodes.has(m[1].slice(a.length + 1))) return [a, m[1].slice(a.length + 1)];
      return null;
    };
    const edges = [];
    const seen = new Set();
    for (const p of svg.querySelectorAll(".edgePaths path, path.flowchart-link")) {
      if (seen.has(p)) continue;
      seen.add(p);
      const style = getComputedStyle(p);
      if (style.stroke === "none" || parseFloat(style.strokeWidth) === 0 || parseFloat(style.opacity) === 0 || /invisible/.test(p.getAttribute("class") || "")) continue;
      const ends = endsOf(p.id);
      const len = p.getTotalLength();
      if (!len) continue;
      const m = toRoot(p);
      const n = Math.max(2, Math.ceil(len / 5));
      const pts = [];
      for (let i = 0; i <= n; i++) { const q = p.getPointAtLength((len * i) / n); pts.push(map(m, q.x, q.y)); }
      edges.push({ ends, pts, len: len * Math.hypot(m.a, m.b), arrow: !!p.getAttribute("marker-end"), el: p });
    }
    const labels = [...svg.querySelectorAll("g.edgeLabel")].filter((g) => g.textContent.trim()).map(boxOf);

    // Main direction: where edges mostly go, from source centre to target centre.
    let sx = 0, sy = 0, ax = 0, ay = 0;
    for (const e of edges) {
      if (!e.ends) continue;
      const a = nodes.get(e.ends[0]).box, b = nodes.get(e.ends[1]).box;
      sx += cx(b) - cx(a); sy += cy(b) - cy(a); ax += Math.abs(cx(b) - cx(a)); ay += Math.abs(cy(b) - cy(a));
    }
    const vertical = ay >= ax;
    const sign = (vertical ? sy : sx) >= 0 ? 1 : -1;
    const along = (b) => (vertical ? cy(b) : cx(b)) * sign;
    const across = (b) => (vertical ? cx(b) : cy(b));
    const extentAcross = vertical ? W : H;
    const forward = (e) => e.ends && along(nodes.get(e.ends[1]).box) - along(nodes.get(e.ends[0]).box) > 10;
    const backward = (e) => e.ends && along(nodes.get(e.ends[1]).box) - along(nodes.get(e.ends[0]).box) < -10;

    // Balance: each parent centred over the span of its children, and a single root centred.
    const offsets = [];
    for (const [id, n] of nodes) {
      const kids = edges.filter((e) => forward(e) && e.ends[0] === id).map((e) => across(nodes.get(e.ends[1]).box));
      if (!kids.length) continue;
      const mid = (Math.min(...kids) + Math.max(...kids)) / 2;
      offsets.push(Math.abs(across(n.box) - mid) / extentAcross);
    }
    const roots = ids.filter((id) => !edges.some((e) => forward(e) && e.ends[1] === id));
    const rootOffset = roots.length === 1 ? Math.abs(across(nodes.get(roots[0]).box) - (vertical ? vb.x + W / 2 : vb.y + H / 2)) / extentAcross : 0;
    const balance = -((offsets.length ? offsets.reduce((s, v) => s + v, 0) / offsets.length : 0) + rootOffset);

    // Contact: the ends of each edge reach their shape (a gap means an arrow short of the node).
    const touches = (pt, node, radius) => {
      for (const s of node.shapes) {
        if (typeof s.isPointInFill !== "function") continue;
        const inv = toRoot(s).inverse();
        for (let k = 0; k < 12; k++) {
          for (const r of [0, radius / 2, radius]) {
            const [x, y] = map(inv, pt[0] + r * Math.cos((k * Math.PI) / 6), pt[1] + r * Math.sin((k * Math.PI) / 6));
            const q = svg.createSVGPoint(); q.x = x; q.y = y;
            if (s.isPointInFill(q) || s.isPointInStroke(q)) return true;
          }
        }
      }
      return false;
    };
    let looseEnds = 0, endsChecked = 0;
    for (const e of edges) {
      if (!e.ends) continue;
      endsChecked += 2;
      if (!touches(e.pts[0], nodes.get(e.ends[0]), 4)) looseEnds++;
      if (!touches(e.pts[e.pts.length - 1], nodes.get(e.ends[1]), e.arrow ? 11 : 4)) looseEnds++;
    }
    const contact = endsChecked ? -looseEnds / endsChecked : 0;

    // Clean exits: edges leaving a node from the same point, labels touching labels or nodes.
    let shared = 0;
    for (const id of ids) {
      const out = edges.filter((e) => e.ends && e.ends[0] === id);
      for (let i = 0; i < out.length; i++)
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i].pts, b = out[j].pts;
          let same = 0;
          for (let k = 0; k < Math.min(4, a.length, b.length); k++) if (Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]) < 3) same++;
          if (same >= 3) shared++;
        }
    }
    let labelHits = 0;
    labels.forEach((l, i) => {
      if (labels.some((o, j) => j > i && overlap(l, o, 1))) labelHits++;
      if ([...nodes.values()].some((n) => overlap(l, n.box, 2))) labelHits++;
    });
    const exits = edges.length ? -(shared + labelHits) / edges.length : 0;

    // Returns: length drawn against the main direction, over the drawing's diagonal.
    const diag = Math.hypot(W, H);
    const returns = -edges.filter(backward).reduce((s, e) => s + e.len, 0) / diag;

    // Crossings (edge pairs that cross away from their ends) and bends.
    const segX = (p, q, r, s) => {
      const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
      if (Math.abs(d) < 1e-9) return false;
      const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d;
      const u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
      return t > 0 && t < 1 && u > 0 && u < 1;
    };
    const nearEnd = (pt, e) => Math.hypot(pt[0] - e.pts[0][0], pt[1] - e.pts[0][1]) < 10 || Math.hypot(pt[0] - e.pts.at(-1)[0], pt[1] - e.pts.at(-1)[1]) < 10;
    let crossPairs = 0;
    for (let i = 0; i < edges.length; i++)
      for (let j = i + 1; j < edges.length; j++) {
        const a = edges[i], b = edges[j];
        let hit = false;
        for (let k = 0; k < a.pts.length - 1 && !hit; k++)
          for (let l = 0; l < b.pts.length - 1 && !hit; l++)
            if (segX(a.pts[k], a.pts[k + 1], b.pts[l], b.pts[l + 1]) && !nearEnd(a.pts[k], a) && !nearEnd(a.pts[k], b)) hit = true;
        if (hit) crossPairs++;
      }
    let bends = 0;
    for (const e of edges) {
      let acc = 0;
      for (let k = 1; k < e.pts.length - 1; k++) {
        const a1 = Math.atan2(e.pts[k][1] - e.pts[k - 1][1], e.pts[k][0] - e.pts[k - 1][0]);
        const a2 = Math.atan2(e.pts[k + 1][1] - e.pts[k][1], e.pts[k + 1][0] - e.pts[k][0]);
        let d = a2 - a1;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        acc += Math.abs(d);
        if (acc > Math.PI / 3) { bends++; acc = 0; }
      }
    }
    const crossings = -(crossPairs + 0.25 * (edges.length ? bends / edges.length : 0));

    // Hard conditions
    const boxes = [...nodes.values()].map((n) => n.box);
    let nodeOverlaps = 0;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i], boxes[j], 1)) nodeOverlaps++;
    let edgesThroughBoxes = 0;
    for (const e of edges) {
      const others = [...nodes.entries()].filter(([id]) => !e.ends || (id !== e.ends[0] && id !== e.ends[1])).map(([, n]) => n.box);
      if (e.pts.some((p) => others.some((b) => inside(p, b, 4)))) edgesThroughBoxes++;
    }
    return {
      scale, printedHeight: Math.round(H * scale),
      legibility: Math.log(scale), economy: -(H * scale) / fitH,
      proportion: -Math.abs(Math.log((W / H) / (fitW / fitH))),
      balance, contact, exits, returns, crossings,
      nodeOverlaps, edgesThroughBoxes, looseEnds,
    };
  } finally {
    host.remove();
  }
}`;

const pairs = JSON.parse(readFileSync(join(here, "pagina/pares.json"), "utf8")) as {
  id: string;
  a: string;
  b: string;
}[];
const session = await BrowserSession.open(findBrowser(process.env.MDRENDER_BROWSER));
const page = await session.newPage();
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8"><style>${readFileSync(join(here, "pagina/fuentes.css"), "utf8")}
body { margin: 0; font-family: "Manrope", "Inter", sans-serif; } foreignObject p { margin: 0; }</style></head><body></body></html>`,
);
await page.evaluate(
  `Promise.all(["400", "600", "700"].map((w) => document.fonts.load(w + ' 16px "Manrope"')))`,
);
await page.evaluate(`globalThis.mdrMeasure = ${MEASURE};`);
const out: Record<string, { A: Measures; B: Measures }> = {};
const measure = (svg: string) =>
  page.evaluate(
    (svg: string, w: number, h: number) =>
      (
        globalThis as unknown as { mdrMeasure(s: string, w: number, h: number): Measures }
      ).mdrMeasure(svg, w, h),
    svg,
    FIT.width,
    FIT.height,
  );
for (const p of pairs) out[p.id] = { A: await measure(p.a), B: await measure(p.b) };
await session.close();
writeFileSync(join(here, "medidas.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`${Object.keys(out).length} pares medidos`);

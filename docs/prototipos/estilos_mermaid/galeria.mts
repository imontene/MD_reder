// Prototype gallery: one flowchart and one sequence diagram rendered in several candidate styles.
// From the repository root (the handwriting fonts are not dependencies of mdrender):
//   npm install --no-save @fontsource/kalam @fontsource/caveat
//   npx tsx docs/prototipos/estilos_mermaid/galeria.mts
// Writes galeria.png next to this file. Needs Playwright with Chromium.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FILL_PROBE,
  finishDiagram,
  MERMAID_THEME_CSS,
  SUBGRAPH_TITLE_MARGIN,
} from "../../../src/render/mermaid-style.ts";
import { mermaidThemeVariables } from "../../../src/render/antigravity.ts";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");

const woff2 = (path: string) => `data:font/woff2;base64,${readFileSync(path).toString("base64")}`;
const face = (family: string, weight: number, path: string) =>
  `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:block;src:url(${woff2(path)}) format("woff2");}`;
const fs = (pkg: string, file: string, root = repo) =>
  join(root, "node_modules/@fontsource", pkg, "files", file);

const FONT_CSS = [
  ...[400, 600, 700].map((w) =>
    face("Manrope", w, fs("manrope", `manrope-latin-${w}-normal.woff2`)),
  ),
  ...[400, 600, 700].map((w) =>
    face("Source Serif 4", w, fs("source-serif-4", `source-serif-4-latin-${w}-normal.woff2`)),
  ),
  ...[400, 700].map((w) =>
    face("JetBrains Mono", w, fs("jetbrains-mono", `jetbrains-mono-latin-${w}-normal.woff2`)),
  ),
  ...[400, 700].map((w) => face("Kalam", w, fs("kalam", `kalam-latin-${w}-normal.woff2`))),
  ...[400, 700].map((w) => face("Caveat", w, fs("caveat", `caveat-latin-${w}-normal.woff2`))),
].join("\n");

const FLOW = `flowchart LR
  sol([Energía del Sol]) --> evap[Evaporación]
  subgraph atm [Atmósfera]
    cond[Condensación] --> nubes((Nubes))
  end
  evap --> cond
  nubes --> prec[Precipitación]
  prec --> q{¿Dónde cae?}
  q -- en tierra --> inf[Infiltración]
  q -- en el mar --> oc[(Océano)]
  inf --> rios[Ríos y acuíferos]
  rios --> oc
  oc --> evap`;

const SEQ = `sequenceDiagram
  participant N as Neurona A
  participant S as Sinapsis
  participant M as Neurona B
  N->>S: Libera neurotransmisores
  S->>M: Se unen a los receptores
  Note over S,M: Se abre el canal iónico
  M-->>N: Señal de recaptación`;

interface Variant {
  key: string;
  title: string;
  lever: string;
  note: string;
  card: string; // CSS for the card the diagram sits on
  font: string;
  fontPx: number;
  config: Record<string, unknown>;
  vars?: Record<string, string | boolean>;
  css?: string;
  /** In-page post-process, as source text: (svgElement, id) => void */
  post?: string;
  finish?: boolean;
}

const SHAPES =
  ".node rect, .node polygon, .node circle, .node ellipse, .node path.label-container, .node .outer-path, rect.actor, rect.note";

const POP_SHADOW = `(svg) => {
  const sel = ".node rect.label-container, .node polygon.label-container, .node path.label-container, .node circle, .node .outer-path, .node > path, rect.actor, rect.note, .cluster > rect";
  for (const el of svg.querySelectorAll(sel)) {
    if (el.closest("foreignObject") || el.dataset.shadow) continue;
    const s = el.cloneNode(true);
    s.dataset.shadow = "1";
    s.removeAttribute("id");
    s.setAttribute("transform", ((el.getAttribute("transform") || "") + " translate(4 4)").trim());
    s.setAttribute("style", "fill:#161616 !important;stroke:#161616 !important;fill-opacity:1 !important");
    for (const c of s.querySelectorAll("*")) c.setAttribute("style", "fill:#161616 !important;stroke:#161616 !important");
    el.dataset.shadow = "0";
    el.parentNode.insertBefore(s, el);
  }
}`;

const INK_PATTERNS = `(svg, id) => {
  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs");
  defs.innerHTML =
    '<pattern id="' + id + '-dots" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#fff"/><circle cx="1.2" cy="1.2" r="0.62" fill="#1b1b1b" fill-opacity="0.55"/></pattern>' +
    '<pattern id="' + id + '-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fff"/><line x1="0" y1="0" x2="0" y2="5" stroke="#c8402f" stroke-width="1.1" stroke-opacity="0.55"/></pattern>' +
    '<pattern id="' + id + '-fine" width="3.2" height="3.2" patternUnits="userSpaceOnUse"><rect width="3.2" height="3.2" fill="#fff"/><circle cx="0.8" cy="0.8" r="0.35" fill="#1b1b1b" fill-opacity="0.4"/></pattern>';
  svg.insertBefore(defs, svg.firstChild);
  const set = (sel, name) => {
    for (const el of svg.querySelectorAll(sel)) el.style.setProperty("fill", "url(#" + id + "-" + name + ")", "important");
  };
  set(".cluster > rect", "fine");
  set(".node circle, .node .outer-path, .node path.label-container, rect.note", "dots");
  set(".node polygon.label-container", "hatch");
}`;

const antigravity = mermaidThemeVariables("antigravity")!;

const VARIANTS: Variant[] = [
  {
    key: "actual",
    title: "0 · Actual (Anti-Gravity)",
    lever: "referencia",
    note: "El acabado de hoy: tema base + variables del tema de página + esquinas, degradado y banda de subgrafo.",
    card: "background:#ffffff",
    font: `"Manrope", sans-serif`,
    fontPx: 14,
    config: { theme: "base", flowchart: { subGraphTitleMargin: SUBGRAPH_TITLE_MARGIN } },
    vars: antigravity,
    css: MERMAID_THEME_CSS,
    finish: true,
  },
  {
    key: "neo",
    title: "1 · Neo (de fábrica)",
    lever: "solo configuración",
    note: "look: neo + theme: neo, tal como viene en Mermaid 12. Sin una línea de código propio.",
    card: "background:#ffffff",
    font: `"Manrope", sans-serif`,
    fontPx: 14,
    config: { theme: "neo", look: "neo" },
  },
  {
    key: "redux",
    title: "2 · Redux color (de fábrica)",
    lever: "solo configuración",
    note: "theme: redux-color + look: neo. Otra familia nueva de Mermaid 12 que hoy no exponemos.",
    card: "background:#ffffff",
    font: `"Manrope", sans-serif`,
    fontPx: 14,
    config: { theme: "redux-color", look: "neo" },
  },
  {
    key: "cuaderno",
    title: "3 · Cuaderno de campo",
    lever: "configuración + paleta + fuente",
    note: "look: handDrawn (trazo irregular con semilla fija) + paleta cálida + letra manuscrita (Kalam).",
    card: "background:#fbf6ea",
    font: `"Kalam", cursive`,
    fontPx: 15,
    config: { theme: "base", look: "handDrawn", handDrawnSeed: 11 },
    vars: {
      background: "#fbf6ea",
      primaryColor: "#fde6a8",
      primaryBorderColor: "#3b3a36",
      primaryTextColor: "#2b2a27",
      secondaryColor: "#cfe6f3",
      secondaryBorderColor: "#3b3a36",
      tertiaryColor: "#e7f0d8",
      tertiaryBorderColor: "#6f7f5a",
      mainBkg: "#fde6a8",
      nodeBorder: "#3b3a36",
      lineColor: "#3b3a36",
      textColor: "#2b2a27",
      clusterBkg: "#e7f0d8",
      clusterBorder: "#6f7f5a",
      edgeLabelBackground: "#fbf6ea",
      noteBkgColor: "#cfe6f3",
      noteBorderColor: "#3b3a36",
      actorBkg: "#fde6a8",
      actorBorder: "#3b3a36",
      actorLineColor: "#8a877d",
      signalColor: "#3b3a36",
      signalTextColor: "#2b2a27",
    },
    css: ".cluster-label, .cluster-label * { font-weight: 700; }",
  },
  {
    key: "pizarra",
    title: "4 · Pizarra",
    lever: "configuración + paleta + fuente + marco",
    note: "handDrawn sobre fondo oscuro, trazo de tiza y letra Caveat. El fondo lo pone el marco del tema de página.",
    card: "background:#22362d;box-shadow:inset 0 0 0 6px #6b4a2e",
    font: `"Caveat", cursive`,
    fontPx: 19,
    config: { theme: "base", look: "handDrawn", handDrawnSeed: 5 },
    vars: {
      darkMode: true,
      background: "#22362d",
      primaryColor: "#2c4439",
      primaryBorderColor: "#f3efe2",
      primaryTextColor: "#f6f2e6",
      secondaryColor: "#2c4439",
      secondaryBorderColor: "#f3efe2",
      tertiaryColor: "#263b32",
      tertiaryBorderColor: "#e9c46a",
      mainBkg: "#2c4439",
      nodeBorder: "#f3efe2",
      lineColor: "#f3efe2",
      textColor: "#f6f2e6",
      titleColor: "#e9c46a",
      clusterBkg: "#263b32",
      clusterBorder: "#e9c46a",
      edgeLabelBackground: "#22362d",
      noteBkgColor: "#3a3a2a",
      noteBorderColor: "#e9c46a",
      noteTextColor: "#f6f2e6",
      actorBkg: "#2c4439",
      actorBorder: "#f3efe2",
      actorTextColor: "#f6f2e6",
      actorLineColor: "#9fb3a8",
      signalColor: "#f3efe2",
      signalTextColor: "#f6f2e6",
      labelTextColor: "#f6f2e6",
    },
    css: ".cluster-label, .cluster-label * { font-weight: 700; color: #e9c46a !important; }",
  },
  {
    key: "tinta",
    title: "5 · Tinta y trama",
    lever: "post-proceso propio",
    note: "Una tinta + un color directo; las categorías se distinguen por trama (puntos, rayado), no por color. Pensado para imprenta en B/N. Etiquetas en serif.",
    card: "background:#ffffff",
    font: `"Source Serif 4", serif`,
    fontPx: 14.5,
    config: { theme: "base" },
    vars: {
      background: "#ffffff",
      primaryColor: "#ffffff",
      primaryBorderColor: "#1b1b1b",
      primaryTextColor: "#1b1b1b",
      secondaryColor: "#ffffff",
      secondaryBorderColor: "#1b1b1b",
      tertiaryColor: "#ffffff",
      tertiaryBorderColor: "#1b1b1b",
      mainBkg: "#ffffff",
      nodeBorder: "#1b1b1b",
      lineColor: "#1b1b1b",
      textColor: "#1b1b1b",
      clusterBkg: "#ffffff",
      clusterBorder: "#1b1b1b",
      edgeLabelBackground: "#ffffff",
      noteBkgColor: "#ffffff",
      noteBorderColor: "#1b1b1b",
      actorBkg: "#ffffff",
      actorBorder: "#1b1b1b",
      actorLineColor: "#1b1b1b",
      signalColor: "#1b1b1b",
    },
    css: `${SHAPES}, .cluster rect { stroke-width: 1.1px; }
.node rect, .cluster rect, rect.actor, rect.note { rx: 2px; ry: 2px; }
.node polygon.label-container { stroke: #c8402f !important; stroke-width: 1.4px; }
.cluster-label, .cluster-label * { font-weight: 700; font-style: italic; }
.nodeLabel, .edgeLabel, .cluster-label span { background: #fff; padding: 0 3px; }`,
    post: INK_PATTERNS,
  },
  {
    key: "pop",
    title: "6 · Pop / sticker",
    lever: "CSS + post-proceso propio",
    note: "Contorno grueso, colores planos y sombra dura desplazada (se duplica cada forma). Aire de infografía o cómic.",
    card: "background:#fffdf5",
    font: `"Manrope", sans-serif`,
    fontPx: 14,
    config: { theme: "base" },
    vars: {
      background: "#fffdf5",
      primaryColor: "#ffd84d",
      primaryBorderColor: "#161616",
      primaryTextColor: "#161616",
      secondaryColor: "#7cd4c0",
      secondaryBorderColor: "#161616",
      tertiaryColor: "#dfe9ff",
      tertiaryBorderColor: "#161616",
      mainBkg: "#ffd84d",
      nodeBorder: "#161616",
      lineColor: "#161616",
      textColor: "#161616",
      clusterBkg: "#dfe9ff",
      clusterBorder: "#161616",
      edgeLabelBackground: "#fffdf5",
      noteBkgColor: "#ff9f8a",
      noteBorderColor: "#161616",
      actorBkg: "#7cd4c0",
      actorBorder: "#161616",
      actorLineColor: "#161616",
      signalColor: "#161616",
    },
    css: `${SHAPES}, .cluster rect { stroke-width: 2.2px !important; }
.node rect, .cluster rect, rect.actor, rect.note { rx: 9px; ry: 9px; }
.flowchart-link, .messageLine0, .messageLine1 { stroke-width: 2.2px !important; }
.nodeLabel, .cluster-label, .cluster-label *, .actor { font-weight: 700; }
.node polygon.label-container { fill: #ff9f8a !important; }
.node circle { fill: #7cd4c0 !important; }`,
    post: POP_SHADOW,
  },
  {
    key: "plano",
    title: "7 · Plano técnico",
    lever: "CSS + marco",
    note: "Sin rellenos, línea fina clara sobre azul con cuadrícula, monoespaciada en versalitas. La cuadrícula es CSS del marco.",
    card: "background-color:#12355b;background-image:linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px);background-size:16px 16px",
    font: `"JetBrains Mono", monospace`,
    fontPx: 11.5,
    config: { theme: "base" },
    vars: {
      darkMode: true,
      background: "#12355b",
      primaryColor: "#12355b",
      primaryBorderColor: "#dbe9ff",
      primaryTextColor: "#eaf2ff",
      secondaryColor: "#12355b",
      secondaryBorderColor: "#dbe9ff",
      tertiaryColor: "#12355b",
      tertiaryBorderColor: "#8fb3e0",
      mainBkg: "#12355b",
      nodeBorder: "#dbe9ff",
      lineColor: "#dbe9ff",
      textColor: "#eaf2ff",
      titleColor: "#8fd3ff",
      clusterBkg: "#12355b",
      clusterBorder: "#8fb3e0",
      edgeLabelBackground: "#12355b",
      noteBkgColor: "#12355b",
      noteBorderColor: "#8fd3ff",
      noteTextColor: "#eaf2ff",
      actorBkg: "#12355b",
      actorBorder: "#dbe9ff",
      actorTextColor: "#eaf2ff",
      actorLineColor: "#8fb3e0",
      signalColor: "#dbe9ff",
      signalTextColor: "#eaf2ff",
      labelTextColor: "#eaf2ff",
    },
    css: `${SHAPES} { fill-opacity: 0.55; stroke-width: 1px; }
.cluster rect { fill: none !important; stroke-dasharray: 5 4; }
.node rect, .cluster rect, rect.actor, rect.note { rx: 0; ry: 0; }
.nodeLabel, .edgeLabel, .cluster-label, .cluster-label *, .actor, .messageText, .noteText { text-transform: uppercase; letter-spacing: 0.06em; }
.cluster-label, .cluster-label * { color: #8fd3ff !important; }`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}
body{margin:0;width:760px;font-family:Manrope}</style></head><body></body></html>`,
);
await page.addScriptTag({ path: join(repo, "node_modules/mermaid/dist/mermaid.min.js") });
await page.evaluate(`globalThis.mdrFillProbe = ${FILL_PROBE};`);
await page.evaluate(async () => {
  const fonts = [
    ["Manrope", [400, 600, 700]],
    ["Source Serif 4", [400, 600, 700]],
    ["JetBrains Mono", [400, 700]],
    ["Kalam", [400, 700]],
    ["Caveat", [400, 700]],
  ] as const;
  await Promise.all(
    fonts.flatMap(([f, ws]) =>
      ws.map((w) => (document as unknown as PageDocument).fonts.load(`${w} 16px "${f}"`)),
    ),
  );
});

const out: Record<string, { flow: string; seq: string }> = {};
for (const v of VARIANTS) {
  const config = {
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: true,
    fontFamily: v.font,
    fontSize: v.fontPx,
    sequence: { mirrorActors: false },
    ...v.config,
    themeVariables: { ...(v.vars ?? {}), fontFamily: v.font, fontSize: `${v.fontPx}px` },
    ...(v.css ? { themeCSS: v.css } : {}),
  };
  const render = async (source: string, id: string) => {
    const result = await page.evaluate(
      async ([source, id, config, post, finish]: Args) => {
        const g = globalThis as unknown as PageGlobals;
        g.mermaid.initialize(config);
        try {
          let { svg } = await g.mermaid.render(id, source);
          if (finish) svg = g.mdrFillProbe(svg);
          if (post) {
            const host = document.createElement("div");
            document.body.appendChild(host);
            host.innerHTML = svg;
            (0, eval)(`(${post})`)(host.querySelector("svg"), id);
            svg = host.innerHTML;
            host.remove();
          }
          return { svg };
        } catch (e) {
          return { error: String((e as Error)?.message ?? e) };
        }
      },
      [source, id, config, v.post ?? null, !!v.finish] as Args,
    );
    if ("error" in result) {
      console.error(v.key, id, result.error);
      return `<pre>${result.error}</pre>`;
    }
    return v.finish ? finishDiagram(result.svg) : result.svg;
  };
  out[v.key] = {
    flow: await render(FLOW, `g-${v.key}-flow`),
    seq: await render(SEQ, `g-${v.key}-seq`),
  };
}

// Contact sheet for checking.
const cards = VARIANTS.map(
  (v) => `<section><h2>${v.title} <small>${v.lever}</small></h2><p>${v.note}</p>
<div class="card" style="${v.card}">${out[v.key]!.flow}</div>
<div class="card" style="${v.card}">${out[v.key]!.seq}</div></section>`,
).join("\n");
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${FONT_CSS}
body{margin:24px;font-family:Manrope,sans-serif;background:#f3f3f1;color:#222;width:1560px}
main{display:grid;grid-template-columns:1fr 1fr;gap:28px}
h2{font-size:17px;margin:0 0 4px} h2 small{font-weight:400;color:#777;font-size:12px;margin-left:8px}
p{margin:0 0 10px;font-size:12.5px;color:#555}
.card{padding:18px;border-radius:10px;margin-bottom:10px;text-align:center}
.card svg{max-width:100%;height:auto} .card foreignObject p{margin:0;font-size:inherit;color:inherit}
</style></head><body><main>${cards}</main></body></html>`;
const sheet = await browser.newPage({
  viewport: { width: 1620, height: 900 },
  deviceScaleFactor: 1,
});
await sheet.setContent(html);
await sheet.screenshot({ path: join(here, "galeria.png"), fullPage: true });
await browser.close();
console.log("ok");

// Browser globals used in page.evaluate (the project is compiled without DOM types).
type Args = [string, string, Record<string, unknown>, string | null, boolean];
interface PageDocument {
  fonts: { load(font: string): Promise<unknown> };
}
interface PageGlobals {
  mermaid: {
    initialize(config: Record<string, unknown>): void;
    render(id: string, text: string): Promise<{ svg: string }>;
  };
  mdrFillProbe(svg: string): string;
}

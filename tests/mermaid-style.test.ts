import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/convert.js";
import {
  addClusterHeads,
  addFillGradients,
  CORNER_RADIUS,
  FILL_OPACITY,
  GRADIENT_STEP,
  HEADER_STEP,
  MERMAID_THEME_CSS,
  rgbToHsl,
  roundedPolygonPath,
  roundNodePolygons,
  straightPathCorners,
  SUBGRAPH_TITLE_MARGIN,
} from "../src/render/mermaid-style.js";
import { browserRequired, tempDir, testBrowser } from "./helpers.js";

const browser = testBrowser();

describe("Mermaid finish", () => {
  it("rounds rectangles, bolds subgraph titles and lets fills show the page", () => {
    expect(MERMAID_THEME_CSS).toContain(
      `.cluster rect, rect.actor, rect.note { rx: ${CORNER_RADIUS}px`,
    );
    expect(MERMAID_THEME_CSS).toContain(".cluster-label, .cluster-label * { font-weight: 700; }");
    expect(MERMAID_THEME_CSS).toMatch(
      new RegExp(`\\.cluster rect[^{]*\\{ fill-opacity: ${FILL_OPACITY}; \\}`),
    );
    // The "neo" look's shadows would grey a see-through fill.
    expect(MERMAID_THEME_CSS).toContain("filter: none !important");
  });

  it("eases each corner of a polygon, less where an edge is short", () => {
    const d = roundedPolygonPath(
      [
        [0, 0],
        [100, 0],
        [100, 9],
        [0, 9],
      ],
      5,
    );
    // Corner (100,0): eased by the same amount on both sides, limited to a third of the 9 px side.
    expect(d).toContain("L97,0 Q100,0 100,3");
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith(" Z")).toBe(true);
    expect(d.match(/Q/g)).toHaveLength(4);
    // Long edges get the full radius.
    expect(
      roundedPolygonPath(
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        5,
      ),
    ).toContain("L95,0 Q100,0 100,5");
  });

  it("redraws node polygons as rounded paths and leaves arrowheads alone", () => {
    const svg =
      '<polygon points="0,7 11.5,14 11.5,0" class="arrowMarkerPath"></polygon>' +
      '<polygon points="85.5,0 171,-85.5 85.5,-171 0,-85.5" class="label-container" transform="translate(-85, 85.5)"></polygon>';
    const out = roundNodePolygons(svg);
    expect(out).toContain('<polygon points="0,7 11.5,14 11.5,0" class="arrowMarkerPath">');
    expect(out).toMatch(
      /<path d="M[^"]+Q[^"]+Z" class="label-container" transform="translate\(-85, 85\.5\)"><\/path>/,
    );
    expect(out).not.toContain('points="85.5');
  });

  it("finds the corners of straight hand-drawn shapes, double strokes included", () => {
    // The fill: one subpath of straight cubic segments.
    const fill = "M0 0 C5 0, 10 0, 20 0 C20 5, 20 7, 20 10 C10 10, 5 10, 0 10 C0 7, 0 3, 0 0";
    expect(straightPathCorners(fill)).toEqual([
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ]);
    // The outline: each side drawn twice.
    const outline =
      "M0 0 C5 0, 10 0, 20 0 M0 0 C7 0, 12 0, 20 0 M20 0 C20 5, 20 7, 20 10 M20 0 C20 4, 20 8, 20 10 " +
      "M20 10 C10 10, 5 10, 0 10 M20 10 C12 10, 6 10, 0 10 M0 10 C0 7, 0 3, 0 0 M0 10 C0 6, 0 2, 0 0";
    expect(straightPathCorners(outline)).toEqual([
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ]);
  });

  it("leaves curves, open lines and other commands alone", () => {
    expect(straightPathCorners("M0 0 C0 10, 20 10, 20 0 C20 -10, 0 -10, 0 0")).toBeUndefined(); // curved
    expect(straightPathCorners("M0 0 C5 0, 10 0, 20 0 C20 5, 20 7, 20 10")).toBeUndefined(); // open
    expect(straightPathCorners("M 0 0 L 10 5 L 0 10 z")).toBeUndefined(); // arrowhead
    expect(straightPathCorners("M0,0 A5,5 0 0 1 10,0 Z")).toBeUndefined(); // arc
  });
});

describe("Mermaid gradients and subgraph headers", () => {
  it("reads computed colours as HSL", () => {
    expect(rgbToHsl("rgb(255, 255, 255)")).toEqual([0, 0, 100]);
    const [h, s, l] = rgbToHsl("rgba(36, 86, 211, 0.5)")!;
    expect([Math.round(h), Math.round(s), Math.round(l)]).toEqual([223, 71, 48]);
    expect(rgbToHsl("url(#x)")).toBeUndefined();
  });

  it("fills marked shapes with a soft vertical gradient, one per colour", () => {
    const svg =
      '<svg id="mermaid-3" viewBox="0 0 10 10"><style>x</style>' +
      '<rect class="basic label-container" style="" data-mdr-fill="rgb(128, 128, 128)" x="0"></rect>' +
      '<rect class="actor" data-mdr-fill="rgb(128, 128, 128)"></rect>' +
      '<path class="label-container" style="fill:#f9f;stroke:#333" data-mdr-fill="rgb(255, 153, 255)" d="M0,0"></path>' +
      '<rect class="plain"></rect></svg>';
    const out = addFillGradients(svg);
    expect(out).not.toContain("data-mdr-fill");
    expect(out.match(/<linearGradient /g)).toHaveLength(2);
    expect(out).toMatch(
      /^<svg id="mermaid-3" viewBox="0 0 10 10"><defs><linearGradient id="mermaid-3-fill-0" x1="0" y1="0" x2="0" y2="1">/,
    );
    // Lighter at the top, darker at the bottom; the see-through opacity is in the stops.
    expect(out).toContain(
      `<stop offset="0" stop-color="hsl(0 0% ${50.2 + GRADIENT_STEP}%)" stop-opacity="${FILL_OPACITY}">`,
    );
    expect(out).toContain(`stop-color="hsl(0 0% ${50.2 - GRADIENT_STEP}%)"`);
    expect(out).toContain(
      'style="fill: url(#mermaid-3-fill-0) !important; fill-opacity: 1 !important" x="0"',
    );
    expect(out).toContain(
      '<rect style="fill: url(#mermaid-3-fill-0) !important; fill-opacity: 1 !important" class="actor">',
    );
    // The author's own style stays, with the gradient of its colour over it.
    expect(out).toContain('style="fill:#f9f;stroke:#333; fill: url(#mermaid-3-fill-1) !important');
    expect(out).toContain('<rect class="plain"></rect>');
    expect(addFillGradients('<svg id="a"><rect></rect></svg>')).toBe(
      '<svg id="a"><rect></rect></svg>',
    );
  });

  const cluster = (fill: string) =>
    `<g class="cluster" id="m-G1" data-look="neo"><rect style="" x="10" y="20" width="200" height="120" data-mdr-cluster-fill="${fill}"></rect>` +
    '<g class="cluster-label" transform="translate(80, 23)"><foreignObject width="40" height="21"><div>Grupo</div></foreignObject></g></g>';

  it("puts a header band behind each subgraph title, darker on a light subgraph", () => {
    const out = addClusterHeads(cluster("rgb(246, 248, 251)"));
    expect(out).not.toContain("data-mdr-cluster-fill");
    // Band from the top (inside the outline) to the margin under the title, before the label.
    const bottom = 23 + 21 + SUBGRAPH_TITLE_MARGIN.bottom;
    expect(out).toContain(
      `></rect><path class="cluster-head" d="M10.5,${bottom} L10.5,25 Q10.5,20.5 15,20.5 L205,20.5 Q209.5,20.5 209.5,25 L209.5,${bottom} Z"`,
    );
    expect(out).toContain(`</path><g class="cluster-label"`);
    const lightness = Number(/hsl\([\d.]+ [\d.]+% ([\d.]+)%\)/.exec(out)![1]);
    expect(lightness).toBeCloseTo(rgbToHsl("rgb(246, 248, 251)")![2] - HEADER_STEP, 1);
    expect(out).toContain(`fill-opacity: ${FILL_OPACITY}; stroke: none`);
  });

  it("makes the band lighter on a dark subgraph, and skips unmarked ones", () => {
    const out = addClusterHeads(cluster("rgb(16, 20, 27)"));
    const lightness = Number(/hsl\([\d.]+ [\d.]+% ([\d.]+)%\)/.exec(out)![1]);
    expect(lightness).toBeCloseTo(rgbToHsl("rgb(16, 20, 27)")![2] + HEADER_STEP, 1);
    const unmarked = cluster("x").replace(' data-mdr-cluster-fill="x"', "");
    expect(addClusterHeads(unmarked)).toBe(unmarked);
  });
});

describe.skipIf(!browser && !browserRequired)("Mermaid finish in documents", () => {
  const source = [
    "```mermaid",
    "flowchart LR",
    "  subgraph G[Grupo]",
    "    A[Inicio] --> B{Decisión}",
    "    B --> C>Bandera]",
    "  end",
    "```",
    "",
  ].join("\n");

  const render = async (format: "html" | "pdf") => {
    const dir = tempDir();
    const input = path.join(dir, "doc.md");
    writeFileSync(input, source);
    const output = path.join(dir, `doc.${format}`);
    const result = await convertFile({
      input,
      output,
      format,
      config: false,
      overrides: { theme: "light" },
    });
    expect(result.diagnostics).toEqual([]);
    return readFileSync(output);
  };

  it("carries the finish in the SVG, with no sharp node polygon left", async () => {
    const svg = (await render("html")).toString("utf8");
    expect(svg).toContain("fill-opacity");
    expect(svg).toContain("font-weight:700");
    expect(svg).not.toMatch(/<polygon[^>]*class="label-container"/);
    const shapes = svg.match(/<(?:rect|path|polygon)\b[^>]*\blabel-container\b[^>]*>/g)!;
    // Decision and flag are now rounded paths.
    expect(
      svg.match(/<path\b(?![^>]*cluster-head)[^>]*\sd="M[^"]*Q[^"]*Z"/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    // Every node shape has a gradient; the subgraph keeps its plain fill, under a header band.
    for (const tag of shapes) expect(tag).toMatch(/fill: url\(#mermaid-1-fill-\d+\)/);
    expect(svg).toMatch(
      /<g class="cluster"[^>]*><rect style=""[^>]*><\/rect><path class="cluster-head"/,
    );
    expect(svg).not.toContain("data-mdr-");
  });

  it("gives sequence actors and notes the gradient too", async () => {
    const dir = tempDir();
    const input = path.join(dir, "seq.md");
    writeFileSync(input, "```mermaid\nsequenceDiagram\n  A->>B: Hola\n  Note over B: Nota\n```\n");
    const output = path.join(dir, "seq.html");
    await convertFile({
      input,
      output,
      format: "html",
      config: false,
      overrides: { theme: "light" },
    });
    const html = readFileSync(output, "utf8");
    expect(html).toMatch(/<rect[^>]*fill: url\(#mermaid-1-fill-\d+\)[^>]*class="actor/);
    expect(html).toMatch(/<rect[^>]*fill: url\(#mermaid-1-fill-\d+\)[^>]*class="note"/);
  });

  it("draws diagrams in the PDF as vectors, with no shadow bitmaps", async () => {
    const raw = (await render("pdf")).toString("latin1");
    expect(raw.match(/\/Subtype\s*\/Image/g) ?? []).toHaveLength(0);
  });
});

async function pageTexts(file: string): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)) });
  const doc = await task.promise;
  const texts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await task.destroy();
  return texts;
}

describe.skipIf(!browser && !browserRequired)("Mermaid diagrams in a framed card", () => {
  // A diagram as tall as the page: the magazine themes draw it on a padded card.
  const source = [
    "```mermaid",
    "flowchart LR",
    "  subgraph G1[Grupo uno]",
    "    A[Rectángulo] --> B{Decisión}",
    "    B --> C{{Hexágono}}",
    "  end",
    "  subgraph G2[Grupo dos]",
    "    D[/Paralelogramo/] --> E([Estadio]) --> F((Círculo)) --> H[(Base)]",
    "    I>Bandera] --> J[\\Trapecio/]",
    "  end",
    "  C --> D",
    "```",
    "",
  ].join("\n");

  it.each(["tech_magazine", "tech_magazine-dark"])(
    "fit their page inside the card in %s, instead of leaving it empty",
    async (theme) => {
      const dir = tempDir();
      const input = path.join(dir, "doc.md");
      writeFileSync(input, source);
      const output = path.join(dir, "doc.pdf");
      const result = await convertFile({
        input,
        output,
        format: "pdf",
        config: false,
        overrides: { theme },
      });
      expect(result.diagnostics).toEqual([]);
      // The card's padding used to push the diagram to page 2, leaving an empty card on page 1.
      const texts = await pageTexts(output);
      expect(texts).toHaveLength(1);
      expect(texts[0]).toContain("Rectángulo");
      expect(texts[0]).toContain("Base");
    },
  );
});

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/convert.js";
import {
  CORNER_RADIUS,
  FILL_OPACITY,
  MERMAID_THEME_CSS,
  roundedPolygonPath,
  roundNodePolygons,
  straightPathCorners,
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
    // Decision and flag are now rounded paths.
    expect(svg.match(/<path[^>]*d="M[^"]*Q[^"]*Z"/g)?.length).toBeGreaterThanOrEqual(2);
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

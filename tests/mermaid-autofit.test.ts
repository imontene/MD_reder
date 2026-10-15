import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { BrowserPool, convertFile, describeLayout } from "../src/convert.js";
import { renderMarkdown } from "../src/markdown/index.js";
import { normalizeOptions, OptionsError } from "../src/options.js";
import { renderMermaid, type DiagramResult } from "../src/render/mermaid.js";
import {
  authorConfigured,
  chooseCandidate,
  flippedDirection,
  flowchartHeader,
  measureSvg,
  printScale,
  withDirection,
  wrapsExhausted,
  type Candidate,
} from "../src/render/mermaid-fit.js";
import { browserRequired, fixture, tempDir, testBrowser } from "./helpers.js";

const browser = testBrowser();

describe("flowchart header", () => {
  it("finds the main direction after front matter, comments and blank lines", () => {
    expect(flowchartHeader("flowchart LR\n  A --> B")).toEqual({ line: 0, direction: "LR" });
    expect(flowchartHeader("graph td\nA-->B")).toEqual({ line: 0, direction: "TD" });
    expect(flowchartHeader("---\ntitle: T\n---\n\n%% nota\n  flowchart RL\nA-->B")).toEqual({
      line: 5,
      direction: "RL",
    });
    // Without a direction a flowchart is top-to-bottom.
    expect(flowchartHeader("flowchart\nA-->B")).toEqual({ line: 0, direction: "TB" });
    expect(flowchartHeader("graph;A-->B")).toEqual({ line: 0, direction: "TB" });
  });

  it("ignores other diagram types", () => {
    for (const source of ["sequenceDiagram\nA->>B: x", 'pie\n"a": 1', "flowchartish LR", ""]) {
      expect(flowchartHeader(source), source).toBeUndefined();
    }
  });

  it("changes only the main direction, not subgraph directions", () => {
    const source =
      "%% c\nflowchart TD\n  subgraph S\n    direction LR\n    A --> B\n  end\n  flowchart LR";
    const header = flowchartHeader(source)!;
    expect(withDirection(source, header, flippedDirection(header.direction))).toBe(
      "%% c\nflowchart LR\n  subgraph S\n    direction LR\n    A --> B\n  end\n  flowchart LR",
    );
    expect(withDirection("flowchart\nA-->B", flowchartHeader("flowchart\nA-->B")!, "LR")).toBe(
      "flowchart LR\nA-->B",
    );
  });

  it("turns horizontal diagrams top-to-bottom and vertical ones left-to-right", () => {
    expect(["LR", "RL", "TB", "TD", "BT"].map((d) => flippedDirection(d as "LR"))).toEqual([
      "TB",
      "TB",
      "LR",
      "LR",
      "LR",
    ]);
  });

  it("detects configuration set by the author", () => {
    expect(authorConfigured('%%{init: {"theme": "forest"}}%%\nflowchart LR')).toBe(true);
    expect(authorConfigured("%%{ initialize: {} }%%\ngraph TD")).toBe(true);
    expect(authorConfigured("---\nconfig:\n  flowchart:\n    curve: basis\n---\ngraph TD")).toBe(
      true,
    );
    expect(authorConfigured("---\ntitle: Sin configuración\n---\ngraph TD")).toBe(false);
    expect(authorConfigured("%% init es solo un comentario\ngraph TD")).toBe(false);
  });
});

describe("candidate scoring", () => {
  const fit = { width: 740, height: 958 };
  const c = (width: number, height: number, extra: Partial<Candidate> = {}): Candidate => ({
    svg: "",
    wrap: undefined,
    flipped: false,
    width,
    height,
    scale: printScale({ width, height }, fit),
    ...extra,
  });

  it("measures the SVG viewBox and the printed scale", () => {
    expect(measureSvg('<svg viewBox="-50 -10 713 276.5" x="1">')).toEqual({
      width: 713,
      height: 276.5,
    });
    expect(measureSvg("<svg>")).toBeUndefined();
    expect(printScale({ width: 1480, height: 100 }, fit)).toBe(0.5);
    expect(printScale({ width: 300, height: 1916 }, fit)).toBe(0.5);
    expect(printScale({ width: 300, height: 1916 }, { width: 740, height: Infinity })).toBe(1);
  });

  it("prefers the shortest layout among those that read the same, never below the original", () => {
    const base = c(400, 900); // scale 1
    const wide = c(700, 500, { wrap: 400 });
    const tooWide = c(900, 300, { wrap: 900 }); // scale 0.82: shorter but smaller text
    expect(chooseCandidate([base, wide, tooWide], base)).toBe(wide);
  });

  it("keeps the written direction unless it stays small and turning gains enough", () => {
    const base = c(2000, 60); // 0.37
    const turned = c(230, 740, { flipped: true }); // 1
    expect(chooseCandidate([base, turned], base)).toBe(turned);

    const fine = c(925, 200); // 0.8: readable, not turned
    expect(chooseCandidate([fine, c(300, 800, { flipped: true })], fine)).toBe(fine);

    const small = c(1057, 100); // 0.70
    const slightlyBetter = c(925, 300, { flipped: true }); // 0.80: gains only 0.10
    expect(chooseCandidate([small, slightlyBetter], small)).toBe(small);
  });

  it("stops trying wider wrapping once the diagram overflows and shrinks", () => {
    const previous = c(700, 400);
    expect(wrapsExhausted(c(900, 300), previous, fit)).toBe(true);
    expect(wrapsExhausted(c(720, 300), previous, fit)).toBe(false);
    expect(wrapsExhausted(c(900, 300), undefined, fit)).toBe(false);
  });

  it("describes the chosen layout for --verbose", () => {
    const layout = { baseScale: 0.33, scale: 1, baseHeight: 81, height: 903, tried: 8 };
    expect(describeLayout({ ...layout, wrap: 400, turned: "LR→TB" })).toBe(
      "Mermaid autofit: wrap 400, turned LR→TB, scale 0.33 → 1.00, height 81 → 903 px (8 layouts tried)",
    );
    expect(describeLayout({ ...layout, wrap: undefined, scale: 0.33, tried: 2 })).toBe(
      "Mermaid autofit: kept as written (scale 0.33, 2 layouts tried)",
    );
  });
});

describe("autofit options", () => {
  it("default to autofit with turning allowed, and validate", () => {
    expect(
      normalizeOptions({ "mermaid-autofit": false, mermaidFlip: "Never" }, "front matter", "/"),
    ).toEqual({ mermaidAutofit: false, mermaidFlip: "never" });
    expect(() => normalizeOptions({ mermaidFlip: "always" }, "x", "/")).toThrow(OptionsError);
    expect(() => normalizeOptions({ mermaidAutofit: "yes" }, "x", "/")).toThrow(OptionsError);
  });
});

describe("headings kept with their figure", () => {
  it("wraps a heading and the diagram or lone image right after it", () => {
    const { html, mermaid } = renderMarkdown(
      "## A\n\n```mermaid\ngraph LR\nA-->B\n```\n\n## B\n\n![x](x.png)\n\n## C\n\ntexto\n\n" +
        "## D\n\n![x](x.png) con texto\n",
    );
    expect(html.match(/<div class="keep-with-heading">/g)).toHaveLength(2);
    expect(html).toMatch(
      /<div class="keep-with-heading">\n<h2 id="a">A<\/h2>\n<figure class="mermaid-diagram">.*<\/figure>\n<\/div>/,
    );
    expect(html).toMatch(
      /<div class="keep-with-heading">\n<h2 id="b">B<\/h2>\n<p><img[^>]*><\/p>\n<\/div>/,
    );
    expect(mermaid[0]!.afterHeading).toBe(true);
  });

  it("leaves nested headings and diagrams without a heading alone", () => {
    const { html, mermaid } = renderMarkdown("- ## Lista\n\ntexto\n\n```mermaid\npie\n```\n");
    expect(html).not.toContain("keep-with-heading");
    expect(mermaid[0]!.afterHeading).toBeUndefined();
  });
});

const LONG_LABEL =
  "Una etiqueta muy larga que describe con detalle el paso del proceso, sus parámetros y el motivo";
const CHAIN_LR =
  "flowchart LR\n" +
  Array.from(
    { length: 8 },
    (_, i) => `  N${i}[Paso ${i} del proceso] --> N${i + 1}[Paso ${i + 1}]`,
  ).join("\n");

describe.skipIf(!browser && !browserRequired)("autofit in the browser", () => {
  const render = async (sources: string[], options: Parameters<typeof renderMermaid>[2]) => {
    const pool = new BrowserPool();
    try {
      const blocks = sources.map((source) => ({ source }));
      return await renderMermaid(await pool.get(), blocks, {
        widthPx: 740,
        pageHeightPx: 958,
        ...options,
      });
    } finally {
      await pool.close();
    }
  };
  const ok = (result: DiagramResult | undefined) => {
    if (!result || "error" in result) throw new Error(`not rendered: ${JSON.stringify(result)}`);
    return result;
  };

  it("turns a long left-to-right chain with flip auto, not with never", async () => {
    const [auto, never, off] = [
      ok((await render([CHAIN_LR], {}))[0]),
      ok((await render([CHAIN_LR], { flip: "never" }))[0]),
      ok((await render([CHAIN_LR], { autofit: false }))[0]),
    ];
    expect(off.scale!).toBeLessThan(0.6);
    expect(off.layout).toBeUndefined();
    expect(auto.layout?.turned).toBe("LR→TB");
    expect(auto.scale).toBe(1);
    expect(never.layout?.turned).toBeUndefined();
    expect(never.scale!).toBeGreaterThanOrEqual(off.scale! - 1e-9);
  });

  it("widens the wrapping of tall diagrams with long labels without shrinking them", async () => {
    const source = `flowchart TD\n  A[${LONG_LABEL}] --> B[${LONG_LABEL}]\n  B --> C[${LONG_LABEL}]`;
    const result = ok((await render([source], {}))[0]);
    expect(result.layout!.wrap).toBeGreaterThan(200);
    expect(result.layout!.turned).toBeUndefined();
    expect(result.layout!.height).toBeLessThan(result.layout!.baseHeight);
    expect(result.layout!.scale).toBeGreaterThanOrEqual(result.layout!.baseScale);
  });

  it("draws diagrams with the author's configuration, and other types, once", async () => {
    const results = await render(
      [`%%{init: {"flowchart": {"wrappingWidth": 150}}}%%\n${CHAIN_LR}`, 'pie\n  "a": 1'],
      {},
    );
    for (const result of results) expect(ok(result).layout).toBeUndefined();
  });

  it("never prints a flowchart smaller than written (synthetic corpus)", async () => {
    const { mermaid } = renderMarkdown(readFileSync(fixture("mermaid-autofit.md"), "utf8"));
    const sources = mermaid.map((block) => block.source);
    const [before, after] = [await render(sources, { autofit: false }), await render(sources, {})];
    const scale = (r: DiagramResult | undefined) => ok(r).scale ?? 1;
    sources.forEach((_, i) => {
      expect(scale(after[i]), `diagram ${i + 1}`).toBeGreaterThanOrEqual(scale(before[i]) - 1e-9);
    });
    const mean = (rs: DiagramResult[]) => rs.reduce((sum, r) => sum + scale(r), 0) / rs.length;
    expect(mean(after)).toBeGreaterThan(mean(before) + 0.1);
    expect(after.filter((r) => scale(r) < 0.6)).toHaveLength(0);
  });

  it("warns in the PDF about a diagram that stays too small", async () => {
    const dir = tempDir();
    const input = path.join(dir, "small.md");
    writeFileSync(input, "```mermaid\n" + CHAIN_LR + "\n```\n");
    const output = path.join(dir, "small.pdf");
    const off = await convertFile({
      input,
      output,
      format: "pdf",
      config: false,
      overrides: { mermaidAutofit: false },
    });
    expect(off.diagnostics.map((d) => d.message)).toEqual([
      expect.stringMatching(/^Mermaid diagram printed at \d+% of its size/),
    ]);
    const on = await convertFile({ input, output, format: "pdf", config: false });
    expect(on.diagnostics).toEqual([]);
    expect(on.notes).toEqual([{ line: 1, message: expect.stringContaining("turned LR→TB") }]);
  });
  it("moves a heading to the next page together with a diagram that does not fit", async () => {
    const dir = tempDir();
    const input = path.join(dir, "orphan.md");
    const filler = Array.from({ length: 22 }, (_, i) => `Párrafo ${i + 1}.`).join("\n\n");
    // Tall enough to be scaled to the page height: without room kept for the heading, the two
    // cannot share a page and the heading was left alone at the bottom of the previous one.
    const diagram =
      "flowchart TD\n" +
      Array.from({ length: 30 }, (_, i) => `  P${i}[Paso ${i}] --> P${i + 1}[Paso ${i + 1}]`).join(
        "\n",
      );
    writeFileSync(
      input,
      `${filler}\n\n## Título del diagrama\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`,
    );
    const output = path.join(dir, "orphan.pdf");
    await convertFile({ input, output, format: "pdf", config: false });

    const task = getDocument({ data: new Uint8Array(readFileSync(output)) });
    const doc = await task.promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    await task.destroy();
    const headingPage = pages.findIndex((text) => text.includes("Título del diagrama"));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[headingPage]).toContain("Paso 0");
    expect(pages[0]).toContain("Párrafo 22");
  });
});

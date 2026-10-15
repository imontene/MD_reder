import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { BrowserPool, convertFile, renderDocument } from "../src/convert.js";
import { SHORT_CODE_LINES } from "../src/markdown/code-blocks.js";
import { renderMarkdown } from "../src/markdown/index.js";
import {
  DEFAULT_OPTIONS,
  fontSizePx,
  mergeOptions,
  normalizeOptions,
  OptionsError,
} from "../src/options.js";
import { contentHeightPx } from "../src/render/page.js";
import { buildHtmlDocument } from "../src/render/template.js";
import { browserRequired, tempDir, testBrowser } from "./helpers.js";

const browser = testBrowser();

const lines = (n: number) => Array.from({ length: n }, (_, i) => `linea_${i + 1}`).join("\n");

describe("code blocks across pages", () => {
  it(`keeps blocks of up to ${SHORT_CODE_LINES} lines together`, () => {
    const { html } = renderMarkdown(
      "```py\nx = 1\n```\n\n    indented\n\n```\n" + lines(SHORT_CODE_LINES) + "\n```\n",
    );
    expect(html).toContain('<pre class="hljs keep-together"><code class="language-py">');
    expect(html).toContain('<pre class="keep-together"><code>indented');
    expect(html.match(/keep-together/g)).toHaveLength(3);
  });

  it("lets longer blocks break, and leaves diagrams and math alone", () => {
    const { html } = renderMarkdown(
      "```\n" + lines(SHORT_CODE_LINES + 1) + "\n```\n\n```mermaid\npie\n```\n\n```math\nx\n```\n",
    );
    expect(html).not.toContain("keep-together");
    expect(html).toContain('<figure class="mermaid-diagram">');
    expect(html).toContain('<div class="math-display">');
  });
});

describe("density and font size options", () => {
  it("default to normal density and the theme's font size", () => {
    expect(DEFAULT_OPTIONS.density).toBe("normal");
    expect(DEFAULT_OPTIONS.fontSize).toBeUndefined();
  });

  it("accept compact density and sizes in pt or px", () => {
    expect(
      normalizeOptions({ density: "Compact", "font-size": "10pt" }, "front matter", "/"),
    ).toEqual({ density: "compact", fontSize: "10pt" });
    expect(normalizeOptions({ fontSize: "14px" }, "x", "/")).toEqual({ fontSize: "14px" });
  });

  it("reject other densities and sizes out of range", () => {
    expect(() => normalizeOptions({ density: "tight" }, "x", "/")).toThrow(OptionsError);
    for (const size of ["10", "10em", "4pt", "40pt", "50px"]) {
      expect(() => normalizeOptions({ fontSize: size }, "x", "/"), size).toThrow(/6pt to 24pt/);
    }
  });

  it("converts font sizes to CSS pixels", () => {
    expect(fontSizePx("10.5pt")).toBe(14);
    expect(fontSizePx("12pt")).toBe(16);
    expect(fontSizePx("13px")).toBe(13);
  });
});

describe("page layout CSS", () => {
  it("computes the text area height", () => {
    expect(contentHeightPx("Letter", false, { top: "10mm", bottom: "10mm" })).toBe(980);
    expect(contentHeightPx("Letter", true, { top: "10mm", bottom: "10mm" })).toBe(740);
    expect(contentHeightPx("A4", false, { top: "20mm", bottom: "1in" })).toBe(951);
  });

  it("places layout styles between the theme and the user's stylesheets", () => {
    const html = buildHtmlDocument({
      title: "t",
      body: "",
      themeCss: ["/*theme*/"],
      layoutCss: ["/*layout*/"],
      extraCss: ["/*extra*/"],
    });
    const order = ["/*theme*/", "/*layout*/", "/*extra*/"].map((s) => html.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBeGreaterThan(0);
  });

  it("sets the page height, font size and density stylesheet for the document", async () => {
    const dir = tempDir();
    const input = path.join(dir, "doc.md");
    writeFileSync(input, "---\ndensity: compact\nfont-size: 10pt\n---\n# Hola\n");
    const pool = new BrowserPool();
    const compact = await renderDocument(input, { config: false }, pool);
    expect(compact.html).toContain("--page-content-height: 980px;");
    expect(compact.html).toContain("html { font-size: 10pt; }");
    expect(compact.html).toContain("compact density");

    writeFileSync(input, "# Hola\n");
    const normal = await renderDocument(
      input,
      { config: false, overrides: { orientation: "landscape" } },
      pool,
    );
    expect(normal.html).toContain("--page-content-height: 740px;");
    expect(normal.html).not.toContain("html { font-size:");
    expect(normal.html).not.toContain("compact density");
    await pool.close();
  });

  it("lets the command line override the density from a config layer", () => {
    expect(mergeOptions({ density: "compact" }, { density: "normal" }).density).toBe("normal");
  });
});

async function pagesText(file: string): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await task.destroy();
  return pages;
}

describe.skipIf(!browser && !browserRequired)("using the page area", () => {
  it("continues a long code block on the next page instead of moving it whole", async () => {
    const dir = tempDir();
    const input = path.join(dir, "code.md");
    const filler = Array.from({ length: 20 }, (_, i) => `Parrafo ${i + 1} de relleno.`).join(
      "\n\n",
    );
    writeFileSync(input, `${filler}\n\n\`\`\`\n${lines(40)}\n\`\`\`\n`);
    const output = path.join(dir, "code.pdf");
    await convertFile({ input, output, format: "pdf", config: false });

    const pages = await pagesText(output);
    expect(pages).toHaveLength(2);
    // The block starts on page 1, with at least a few of its lines there.
    expect(pages[0]).toContain("linea_4");
    expect(pages[1]).toContain("linea_40");
  });

  it("fits more text per page with compact density and a smaller font", async () => {
    const dir = tempDir();
    const input = path.join(dir, "long.md");
    const sections = Array.from(
      { length: 24 },
      (_, i) =>
        `## Seccion ${i + 1}\n\n` +
        "Texto de ejemplo para llenar la pagina con varias lineas de contenido. ".repeat(6) +
        "\n\n- uno\n- dos\n- tres\n",
    );
    writeFileSync(input, sections.join("\n"));
    const count = async (overrides: object) => {
      const output = path.join(dir, `${JSON.stringify(overrides).length}.pdf`);
      await convertFile({ input, output, format: "pdf", config: false, overrides });
      return (await pagesText(output)).length;
    };
    const normal = await count({});
    const compact = await count({ density: "compact" });
    const small = await count({ density: "compact", fontSize: "10pt" });
    expect(compact).toBeLessThan(normal);
    expect(small).toBeLessThanOrEqual(compact);
  });

  it("draws sequence diagrams at the text size without repeating the actors", async () => {
    const dir = tempDir();
    const input = path.join(dir, "seq.md");
    writeFileSync(
      input,
      "```mermaid\nsequenceDiagram\n  actor Usuario\n  Usuario->>Servidor: pide\n```\n",
    );
    const output = path.join(dir, "seq.html");
    await convertFile({ input, output, format: "html", config: false });
    const html = readFileSync(output, "utf8");
    expect(html).toMatch(/class="messageText"[^>]*font-size: 14px/);
    expect(html.match(/>Servidor</g)).toHaveLength(1);

    await convertFile({
      input,
      output,
      format: "html",
      config: false,
      overrides: { fontSize: "12pt" },
    });
    expect(readFileSync(output, "utf8")).toMatch(/class="messageText"[^>]*font-size: 16px/);
  });
});

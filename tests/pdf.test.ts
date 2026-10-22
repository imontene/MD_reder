import { readFileSync } from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/convert.js";
import { browserRequired, fixture, tempDir, testBrowser } from "./helpers.js";

const browser = testBrowser();

/** Fonts Chrome falls back to on Linux, Windows and macOS: none should reach the PDF. */
const SYSTEM_FONT = /\/BaseFont \/[A-Z]{6}\+(DejaVu|Liberation|Noto|Arial|SegoeUI|Helvetica|Times)/;

async function openPdf(file: string) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)) });
  return { doc: await task.promise, close: () => task.destroy() };
}

async function pdfOutline(file: string): Promise<string[]> {
  const { doc, close } = await openPdf(file);
  const titles: string[] = [];
  const walk = (items: { title: string; items: unknown[] }[] | null, depth: number) => {
    for (const item of items ?? []) {
      titles.push("  ".repeat(depth) + item.title);
      walk(item.items as typeof items, depth + 1);
    }
  };
  walk(await doc.getOutline(), 0);
  await close();
  return titles;
}

async function pageSize(file: string): Promise<number[]> {
  const { doc, close } = await openPdf(file);
  const view = (await doc.getPage(1)).view.map(Math.round);
  await close();
  return view;
}

/** Smallest x of the text on page 1, in PDF points: where the left margin ends. */
async function leftmostText(file: string): Promise<number> {
  const { doc, close } = await openPdf(file);
  const content = await (await doc.getPage(1)).getTextContent();
  const xs = content.items
    .filter((item) => "str" in item && item.str.trim() !== "")
    .map((item) => ("transform" in item ? (item.transform as number[])[4]! : Infinity));
  await close();
  return Math.min(...xs);
}

async function pdfText(file: string): Promise<{ pages: number; text: string }> {
  const { doc, close } = await openPdf(file);
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
  }
  const pages = doc.numPages;
  await close();
  // Text runs are split differently per platform (e.g. "Mermaid   error" on Windows):
  // collapse whitespace so assertions only depend on the words.
  return { pages, text: text.replace(/\s+/g, " ") };
}

describe.skipIf(!browser && !browserRequired)("PDF rendering", () => {
  it("finds a browser", () => {
    expect(browser, "no Chromium-based browser found; set MDRENDER_BROWSER").toBeDefined();
  });

  it("renders headings, tables, task lists, code and images to PDF with Manrope", async () => {
    const output = path.join(tempDir(), "sample.pdf");
    const result = await convertFile({ input: fixture("sample.md"), output, format: "pdf" });
    expect(result.diagnostics).toEqual([]);

    const bytes = readFileSync(output);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

    const raw = bytes.toString("latin1");
    // Fontsource's static Manrope keeps the variable font's family name ("ManropeExtraLight").
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Manrope\w*-Regular/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Manrope\w*-SemiBold/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+JetBrainsMono-Regular/);
    // Static fonts must be embedded as TrueType, not as Type 3 glyph procedures.
    expect(raw).not.toMatch(/\/Subtype\s*\/Type3/);
    // Two embedded images (PNG and SVG rasterized/embedded as XObjects or paths).
    expect(raw).toMatch(/\/Subtype\s*\/Image/);

    const { pages, text } = await pdfText(output);
    expect(pages).toBe(1);
    expect(text).toContain("Documento de prueba");
    expect(text).toContain("ñandú");
    expect(text).toContain("Ecuaciones y diagramas");
    expect(text).toContain("saludar");
  });

  it("sets the text in Inter with --font inter, header and footer included", async () => {
    const output = path.join(tempDir(), "inter.pdf");
    const result = await convertFile({
      input: fixture("document.md"),
      output,
      format: "pdf",
      overrides: { font: "inter" },
    });
    expect(result.diagnostics).toEqual([]);
    const raw = readFileSync(output).toString("latin1");
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Inter-Regular/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Inter-SemiBold/);
    expect(raw).not.toContain("Manrope");
    expect(raw).not.toMatch(SYSTEM_FONT);
  });

  it("writes the document title into the PDF metadata", async () => {
    const output = path.join(tempDir(), "basic.pdf");
    await convertFile({ input: fixture("basic.md"), output, format: "pdf" });
    const { doc, close } = await openPdf(output);
    const { info } = (await doc.getMetadata()) as { info: { Title?: string } };
    await close();
    expect(info.Title).toBe("Documento de prueba");
  });
});

describe.skipIf(!browser && !browserRequired)("math and diagrams", () => {
  it("embeds KaTeX fonts for equations", async () => {
    const output = path.join(tempDir(), "math.pdf");
    const result = await convertFile({ input: fixture("math.md"), output, format: "pdf" });
    expect(result.diagnostics).toEqual([]);

    const raw = readFileSync(output).toString("latin1");
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+KaTeX_Main-Regular/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+KaTeX_Math-Italic/);
    expect(raw).not.toMatch(/\/Subtype\s*\/Type3/);
    const { text } = await pdfText(output);
    expect(text).toContain("Precios como $5 y $10");
  });

  it("renders the eight Mermaid diagram types", async () => {
    const output = path.join(tempDir(), "mermaid.pdf");
    const result = await convertFile({ input: fixture("mermaid.md"), output, format: "pdf" });
    expect(result.diagnostics).toEqual([]);

    const { text } = await pdfText(output);
    // One label from each diagram: flowchart, sequence, class, state, ER, gantt, pie, mindmap.
    for (const label of [
      "Mermaid",
      "Chromium",
      "Documento",
      "Borrador",
      "AUTOR",
      "Fundaciones",
      "Diseño",
      "Ecuaciones",
    ]) {
      expect(text).toContain(label);
    }
    expect(text).not.toContain("Mermaid error");
  });

  it("inlines diagrams as SVG in HTML output, without scripts", async () => {
    const output = path.join(tempDir(), "mermaid.html");
    const result = await convertFile({ input: fixture("mermaid.md"), output, format: "html" });
    expect(result.diagnostics).toEqual([]);

    const html = readFileSync(output, "utf8");
    expect(html.match(/<svg[^>]+id="mermaid-[\d-]+"/g)).toHaveLength(8);
    expect(html).not.toMatch(/<script/i);
  });

  it("reports LaTeX and Mermaid errors with lines and still writes the file", async () => {
    const output = path.join(tempDir(), "errors.pdf");
    const result = await convertFile({ input: fixture("errors.md"), output, format: "pdf" });

    expect(result.diagnostics.map((d) => [d.severity, d.line])).toEqual([
      ["error", 3],
      ["error", 5],
      ["error", 10],
    ]);
    expect(result.diagnostics[1]!.message).toMatch(/^Mermaid: /);
    const { text } = await pdfText(output);
    expect(text).toContain("Mermaid error");
  });
});

describe.skipIf(!browser && !browserRequired)("document layout", () => {
  it("prints header, page-number footer, bookmarks and highlighted code", async () => {
    const output = path.join(tempDir(), "document.pdf");
    // The classic theme: Anti-Gravity's tracked uppercase labels read letter by letter in pdf.js
    // (tests/antigravity.test.ts covers them).
    const result = await convertFile({
      input: fixture("document.md"),
      output,
      format: "pdf",
      overrides: { theme: "light" },
    });
    expect(result.diagnostics).toEqual([]);

    const { pages, text } = await pdfText(output);
    expect(pages).toBe(2);
    expect(text).toContain("1 / 2");
    expect(text).toContain("2 / 2");
    // Header "{title} | | {date}" on every page, plus the title block.
    expect(text.match(/Informe técnico/g)?.length).toBeGreaterThanOrEqual(3);
    expect(text).toContain("Advertencia");
    expect(text).toContain("Una nota al pie simple.");

    expect(await pdfOutline(output)).toEqual([
      "Informe técnico",
      "  Introducción",
      "  Código",
      "    Lenguaje desconocido",
      "  Notas",
    ]);

    const raw = readFileSync(output).toString("latin1");
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+JetBrainsMono-Italic/); // highlighted comments
    // The header and footer carry their own copy of the text font.
    expect(raw).not.toMatch(SYSTEM_FONT);
  });

  it("honours page size, orientation and the page-numbers switch", async () => {
    const output = path.join(tempDir(), "letter.pdf");
    await convertFile({
      input: fixture("basic.md"),
      output,
      format: "pdf",
      overrides: {
        pageSize: "Letter",
        orientation: "landscape",
        margin: "1in",
        pageNumbers: false,
      },
    });
    expect(await pageSize(output)).toEqual([0, 0, 792, 612]);
    const { text } = await pdfText(output);
    expect(text).not.toContain("1 / 1");
  });
});

describe.skipIf(!browser && !browserRequired)("page size, orientation and margins", () => {
  const mm = (value: number) => (value * 72) / 25.4;
  // Chrome rounds margins to whole CSS pixels (10 mm = 37.8 px → 37 px), so allow ~1.5 pt.
  const expectNear = (actual: number, expected: number) =>
    expect(Math.abs(actual - expected)).toBeLessThan(1.5);

  it("defaults to Letter portrait with 10 mm margins", async () => {
    const output = path.join(tempDir(), "default.pdf");
    await convertFile({ input: fixture("basic.md"), output, format: "pdf", config: false });
    expect(await pageSize(output)).toEqual([0, 0, 612, 792]);
    expectNear(await leftmostText(output), mm(10));
  });

  it.each([
    ["A4", "portrait", [0, 0, 596, 842]],
    ["Legal", "portrait", [0, 0, 612, 1008]],
    ["Legal", "landscape", [0, 0, 1008, 612]],
  ] as const)("prints %s %s", async (pageSize_, orientation, expected) => {
    const output = path.join(tempDir(), "size.pdf");
    await convertFile({
      input: fixture("basic.md"),
      output,
      format: "pdf",
      config: false,
      overrides: { pageSize: pageSize_, orientation },
    });
    expect(await pageSize(output)).toEqual(expected);
  });

  it("applies a single left margin on top of the shorthand", async () => {
    const output = path.join(tempDir(), "left.pdf");
    await convertFile({
      input: fixture("basic.md"),
      output,
      format: "pdf",
      config: false,
      overrides: { margin: "10mm", marginLeft: "40mm" },
    });
    expectNear(await leftmostText(output), mm(40));
  });
});

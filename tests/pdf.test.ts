import { readFileSync } from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/convert.js";
import { browserRequired, fixture, tempDir, testBrowser } from "./helpers.js";

const browser = testBrowser();

async function openPdf(file: string) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)) });
  return { doc: await task.promise, close: () => task.destroy() };
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
  return { pages, text };
}

describe.skipIf(!browser && !browserRequired)("PDF rendering", () => {
  it("finds a browser", () => {
    expect(browser, "no Chromium-based browser found; set MDRENDER_BROWSER").toBeDefined();
  });

  it("renders headings, tables, task lists, code and images to PDF with Inter", async () => {
    const output = path.join(tempDir(), "sample.pdf");
    const result = await convertFile({ input: fixture("sample.md"), output, format: "pdf" });
    expect(result.warnings).toEqual([]);

    const bytes = readFileSync(output);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

    const raw = bytes.toString("latin1");
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Inter-Regular/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Inter-SemiBold/);
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

  it("writes the document title into the PDF metadata", async () => {
    const output = path.join(tempDir(), "basic.pdf");
    await convertFile({ input: fixture("basic.md"), output, format: "pdf" });
    const { doc, close } = await openPdf(output);
    const { info } = (await doc.getMetadata()) as { info: { Title?: string } };
    await close();
    expect(info.Title).toBe("Documento de prueba");
  });
});

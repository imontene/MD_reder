import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { BrowserPool, convertFile, renderDocument } from "../src/convert.js";
import { DEFAULT_OPTIONS, normalizeOptions, OptionsError } from "../src/options.js";
import { FIELD_COLORS, fieldImage, fieldSvg } from "../src/render/field.js";
import { diagonalText, watermarkHtml } from "../src/render/watermark.js";
import { browserRequired, tempDir, testBrowser } from "./helpers.js";

const browser = testBrowser();

describe("watermark options", () => {
  it("are off by default and validated", () => {
    expect(DEFAULT_OPTIONS.watermark).toBeUndefined();
    expect(DEFAULT_OPTIONS.watermarkField).toBe(false);
    expect(
      normalizeOptions({ watermark: "Borrador", "watermark-field": true }, "front matter", "/"),
    ).toEqual({ watermark: "Borrador", watermarkField: true });
    expect(() => normalizeOptions({ watermarkField: "yes" }, "x", "/")).toThrow(OptionsError);
  });
});

describe("watermark HTML", () => {
  const page = { widthPx: 740, heightPx: 980, dark: false };

  it("is empty unless a mark is asked for", () => {
    expect(watermarkHtml({ ...page, field: false })).toBe("");
    expect(watermarkHtml({ ...page, text: "  ", field: false })).toBe("");
  });

  it("holds the text, escaped and in capitals, and/or the field", () => {
    const html = watermarkHtml({ ...page, text: "Borrador <b>1</b>", field: true });
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("BORRADOR &lt;B&gt;1&lt;/B&gt;");
    expect(html).not.toContain("<b>");
    // Fields in the top-left and bottom-right corners, both with the field image.
    expect(
      html.match(
        /class="mdr-watermark-field mdr-field-(top-left|bottom-right)" style="background-image: url\('data:image\/svg\+xml,/g,
      ),
    ).toHaveLength(2);
    expect(html).toContain("mdr-field-top-left");
    expect(html).toContain("mdr-field-bottom-right");
    expect(watermarkHtml({ ...page, field: true })).not.toContain("mdr-watermark-text");
  });

  it("runs the text along the page diagonal, fitted to its length", () => {
    const portrait = diagonalText("BORRADOR", 740, 980);
    const landscape = diagonalText("BORRADOR", 980, 740);
    expect(portrait.angle).toBeCloseTo(52.9, 1);
    expect(landscape.angle).toBeCloseTo(37.1, 1);
    expect(diagonalText("CONFIDENCIAL", 740, 980).fontSize).toBeLessThan(portrait.fontSize);
    // A short word is capped instead of filling the page.
    expect(diagonalText("OK", 740, 980).fontSize).toBe(Math.round(980 * 0.2));
  });

  it("is stronger on dark pages", () => {
    expect(watermarkHtml({ ...page, text: "X", field: true })).toContain("opacity: 0.1");
    expect(watermarkHtml({ ...page, dark: true, text: "X", field: true })).toContain(
      "opacity: 0.14",
    );
  });
});

describe("watermarks in the document", () => {
  it("go into the PDF only, with their stylesheet", async () => {
    const dir = tempDir();
    const input = path.join(dir, "doc.md");
    writeFileSync(input, "---\nwatermark: Borrador\nwatermark-field: true\n---\nTexto.\n");
    const pool = new BrowserPool();
    try {
      const pdf = await renderDocument(input, { config: false }, pool, true);
      expect(pdf.html).toMatch(/<body>\n<div class="mdr-watermark" aria-hidden="true">/);
      expect(pdf.html).toContain(".mdr-watermark-text span");
      const html = await renderDocument(input, { config: false }, pool, false);
      expect(html.html).not.toContain("mdr-watermark");

      writeFileSync(input, "Texto.\n");
      const plain = await renderDocument(input, { config: false }, pool, true);
      expect(plain.html).not.toContain("mdr-watermark");
    } finally {
      await pool.close();
    }
  });
});

/** Pattern fills (gradients) and text of each page. */
async function pages(file: string): Promise<{ patterns: number; text: string }[]> {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)) });
  const doc = await task.promise;
  const result = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const ops = await page.getOperatorList();
    const content = await page.getTextContent();
    result.push({
      patterns: ops.fnArray.filter((fn) => fn === OPS.setFillColorN).length,
      text: content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
    });
  }
  await task.destroy();
  return result;
}

describe.skipIf(!browser && !browserRequired)("watermarked PDF", () => {
  const render = async (overrides: object) => {
    const dir = tempDir();
    const input = path.join(dir, "doc.md");
    writeFileSync(
      input,
      'Primera página.\n\n<div style="break-before: page"></div>\n\nSegunda página.\n',
    );
    const output = path.join(dir, "doc.pdf");
    const result = await convertFile({ input, output, format: "pdf", config: false, overrides });
    expect(result.diagnostics).toEqual([]);
    return pages(output);
  };

  it.each([
    ["the text", { watermark: "Borrador" }],
    ["the field", { watermarkField: true }],
  ])("repeats %s on every page, keeping the document's text", async (_, marks) => {
    const result = await render({ theme: "light", ...marks });
    expect(result).toHaveLength(2);
    // Each page carries the gradient. (Whether the mark's own text reaches the PDF's text
    // layer depends on the Chrome version, so it is not checked.)
    for (const page of result) expect(page.patterns).toBeGreaterThan(0);
    expect(result[0]!.text).toContain("Primera página.");
    expect(result[1]!.text).toContain("Segunda página.");
  });

  it("leaves pages without gradients when no mark is asked for", async () => {
    for (const page of await render({ theme: "light" })) expect(page.patterns).toBe(0);
  });
});

describe("field image", () => {
  it("is an SVG of three fading lights with the theme's opacity", () => {
    const svg = fieldSvg(0.16);
    expect(svg.match(/<radialGradient /g)).toHaveLength(3);
    for (const color of Object.values(FIELD_COLORS)) expect(svg).toContain(`stop-color="${color}"`);
    expect(svg).toContain('stop-opacity="0.16"');
    expect(svg).not.toContain("'");
    expect(fieldImage(true)).toContain(encodeURIComponent('stop-opacity="0.22"'));
    // Safe inside a style="…" attribute.
    expect(fieldImage(false)).toMatch(/^url\('data:image\/svg\+xml,[^'"]+'\)$/);
  });
});

/** Size in bytes and number of images of a PDF. */
function weight(file: string): { bytes: number; images: number } {
  const raw = readFileSync(file);
  return {
    bytes: raw.length,
    images: raw.toString("latin1").match(/\/Subtype\s*\/Image/g)?.length ?? 0,
  };
}

describe.skipIf(!browser && !browserRequired)("field weight in the PDF", () => {
  const render = async (markdown: string, overrides: object, extraCss?: string) => {
    const dir = tempDir();
    const input = path.join(dir, "doc.md");
    writeFileSync(input, markdown);
    const settings: { overrides: object; config: false; css?: string } = {
      overrides,
      config: false,
    };
    if (extraCss) {
      writeFileSync(path.join(dir, "extra.css"), extraCss);
      settings.overrides = { ...overrides, css: [path.join(dir, "extra.css")] };
    }
    const output = path.join(dir, "doc.pdf");
    await convertFile({ input, output, format: "pdf", ...settings });
    return weight(output);
  };
  const pages =
    'Uno.\n\n<div style="break-before: page"></div>\n\nDos.\n\n<div style="break-before: page"></div>\n\nTres.\n';

  it("adds no images and only a few KB on every page", async () => {
    const plain = await render(pages, {});
    const field = await render(pages, { watermarkField: true });
    expect(field.images).toBe(plain.images);
    // CSS gradients used to add ~290 KB per page here.
    expect(field.bytes - plain.bytes).toBeLessThan(20_000);
  });

  it("keeps the title block's field light too", async () => {
    const titled = `---\ntitle: Informe\n---\n\n${pages}`;
    const withField = await render(titled, {});
    const without = await render(titled, {}, ".doc-header::before { display: none !important; }");
    expect(withField.images).toBe(without.images);
    expect(withField.bytes - without.bytes).toBeLessThan(20_000);
  });
});

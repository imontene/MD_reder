import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { BrowserPool, convertFile, renderDocument } from "../src/convert.js";
import { DEFAULT_OPTIONS, normalizeOptions, OptionsError } from "../src/options.js";
import { FIELD_COLORS, fieldImage, fieldSvg } from "../src/render/field.js";
import {
  diagonalText,
  gradientColors,
  WATERMARK_CSS,
  WATERMARK_TEXT,
  watermarkHtml,
} from "../src/render/watermark.js";
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

  it("holds the text, escaped and as written, and/or the field", () => {
    const html = watermarkHtml({ ...page, text: "Borrador <b>1</b>", field: true });
    expect(html).toContain('aria-hidden="true"');
    // One span per letter: the text reads back once the tags are removed.
    expect(html.replace(/<[^>]+>/g, "")).toContain("Borrador &lt;b&gt;1&lt;/b&gt;");
    expect(html).not.toContain("BORRADOR");
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
    // Lowercase letters are narrower: the same word written that way is set larger.
    expect(diagonalText("Borrador", 740, 980).fontSize).toBeGreaterThan(portrait.fontSize);
    // A short word is capped instead of filling the page.
    expect(diagonalText("OK", 740, 980).fontSize).toBe(Math.round(980 * 0.2));
  });

  it("is blended over the content, under a magazine's cover", () => {
    // Under the content, figures, tables and dense text hid the marks; blended above, they tint
    // everything while the text keeps its colour (multiply on light pages, screen on dark ones).
    expect(WATERMARK_CSS).toMatch(
      /\.mdr-watermark \{[^}]*z-index: 2;[^}]*mix-blend-mode: multiply;/,
    );
    expect(WATERMARK_CSS).toContain(".mdr-watermark-dark { mix-blend-mode: screen; }");
    expect(WATERMARK_CSS).toMatch(
      /\.doc-header:is\(\.cover-ink-light, \.cover-ink-dark\) \{[^}]*z-index: 3;/,
    );
    expect(WATERMARK_CSS).not.toContain(".markdown-body {");
    expect(watermarkHtml({ ...page, text: "X", field: false })).toMatch(
      /^<div class="mdr-watermark" /,
    );
    expect(watermarkHtml({ ...page, dark: true, text: "X", field: false })).toMatch(
      /^<div class="mdr-watermark mdr-watermark-dark" /,
    );
  });

  it("is legible: stronger than before, bold, its gradient's stops of even lightness", () => {
    // Each letter in a solid colour along the gradient, from the first stop to the last.
    const light = watermarkHtml({ ...page, text: "ABC", field: false });
    expect(light).toContain('style="opacity: 0.18"');
    expect(light).toContain(
      '<span style="color: #4f7cff">A</span><span style="color: #118fb0">B</span><span style="color: #8c6cf0">C</span>',
    );
    const dark = watermarkHtml({ ...page, dark: true, text: "ABC", field: false });
    expect(dark).toContain('style="opacity: 0.22"');
    expect(dark).toContain('<span style="color: #22c3e6">B</span>');
    expect(gradientColors(["#000000", "#ffffff"], 5)).toEqual([
      "#000000",
      "#404040",
      "#808080",
      "#bfbfbf",
      "#ffffff",
    ]);
    expect(WATERMARK_CSS).toContain("font-weight: 700;");
    // No gradient clipped to the text: Chrome writes it as soft masks, which Acrobat drops.
    expect(WATERMARK_CSS).not.toContain("background-clip");
    // On light pages the three stops have about the same relative luminance.
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((k) => {
        const c = parseInt(hex.slice(k, k + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const values = WATERMARK_TEXT.light.stops.map(luminance);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.02);
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
      expect(pdf.html).toContain(".mdr-watermark-text > span");
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
async function pages(file: string): Promise<
  {
    patterns: number;
    colors: Set<string>;
    text: string;
    multiply: boolean;
    softMasks: boolean;
  }[]
> {
  const raw = readFileSync(file).toString("latin1");
  const task = getDocument({ data: new Uint8Array(readFileSync(file)) });
  const doc = await task.promise;
  const result = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const ops = await page.getOperatorList();
    const content = await page.getTextContent();
    const colors = new Set<string>();
    ops.fnArray.forEach((fn, k) => {
      if (fn === OPS.setFillRGBColor) colors.add(String(ops.argsArray[k]![0]));
    });
    result.push({
      patterns: ops.fnArray.filter((fn) => fn === OPS.setFillColorN).length,
      colors,
      text: content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      // The blend survives as a PDF blend mode (vector), not as a picture.
      multiply: raw.includes("/BM /Multiply"),
      softMasks: raw.includes("/SMask"),
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

  it("repeats the text on every page in solid colours, with no soft masks", async () => {
    const result = await render({ theme: "light", watermark: "Borrador" });
    expect(result).toHaveLength(2);
    // Each page carries the letters' colours, from the gradient's first stop to its last.
    // (Whether the mark's own text reaches the PDF's text layer depends on the Chrome version,
    // so it is not checked.)
    for (const page of result) {
      expect(page.colors).toContain("#4f7cff");
      expect(page.colors).toContain("#8c6cf0");
    }
    expect(result[0]!.multiply).toBe(true);
    // A gradient clipped to the text was written as soft masks, which Adobe Acrobat paints the
    // first time a page is shown and then drops: the mark vanished on coming back to a page.
    expect(result[0]!.softMasks).toBe(false);
    expect(result[0]!.text).toContain("Primera página.");
    expect(result[1]!.text).toContain("Segunda página.");
  });

  it("repeats the field on every page, keeping the document's text", async () => {
    const result = await render({ theme: "light", watermarkField: true });
    expect(result).toHaveLength(2);
    for (const page of result) expect(page.patterns).toBeGreaterThan(0);
    expect(result[0]!.multiply).toBe(true);
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

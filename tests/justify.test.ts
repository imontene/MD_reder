import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { BrowserPool, convertFile, renderDocument } from "../src/convert.js";
import { SOFT_HYPHEN_CLEANUP } from "../src/render/browser.js";
import { hyphenatorFor, SOFT_HYPHEN } from "../src/markdown/hyphenate.js";
import { renderMarkdown } from "../src/markdown/index.js";
import { DEFAULT_OPTIONS, normalizeOptions, OptionsError } from "../src/options.js";
import { browserRequired, tempDir, testBrowser } from "./helpers.js";

const browser = testBrowser();
const SHY = new RegExp(SOFT_HYPHEN, "g");

const LONG =
  "La internacionalización de las aplicaciones contemporáneas requiere considerar " +
  "extraordinariamente las particularidades tipográficas, ortográficas y culturales de cada " +
  "comunidad lingüística destinataria.";

describe("justify option", () => {
  it("is on by default and accepts true or false", () => {
    expect(DEFAULT_OPTIONS.justify).toBe(true);
    expect(normalizeOptions({ justify: false }, "front matter", "/")).toEqual({ justify: false });
    expect(() => normalizeOptions({ justify: "no" }, "x", "/")).toThrow(OptionsError);
  });
});

describe("hyphenation patterns", () => {
  it("picks the patterns of the base language, or of the region where they differ", () => {
    const es = hyphenatorFor("es")!;
    expect(es("internacionalización")).toBe(
      ["in", "ter", "na", "cio", "na", "li", "za", "ción"].join(SOFT_HYPHEN),
    );
    expect(hyphenatorFor("es-CL")).toBe(es);
    expect(hyphenatorFor("en-GB")).not.toBe(hyphenatorFor("en-US"));
    expect(hyphenatorFor("EN")).toBe(hyphenatorFor("en-US"));
    expect(hyphenatorFor("ja")).toBeUndefined();
  });

  it("treats the text as plain text, not HTML", () => {
    expect(hyphenatorFor("es")!("a <b> internacional")).toBe(
      `a <b> in${SOFT_HYPHEN}ter${SOFT_HYPHEN}na${SOFT_HYPHEN}cio${SOFT_HYPHEN}nal`,
    );
  });
});

describe("soft hyphens in justified paragraphs", () => {
  const source = [
    "## Título internacionalización",
    "",
    "Cuerpo internacionalización con `internacionalización` y https://example.com/internacionalizacion.",
    "",
    "> Cita internacionalización",
    ">",
    "> > Anidada internacionalización",
    "",
    "> [!NOTE]",
    "> Alerta internacionalización",
    "",
    "- Lista internacionalización",
    "",
    "| Tabla |",
    "| --- |",
    "| internacionalización |",
    "",
    "Nota[^1] y <https://example.com/internacionalizacion>.",
    "",
    "[^1]: Pie internacionalización",
    "",
  ].join("\n");

  it("go only into body, quote and alert paragraphs, outside code and URLs", () => {
    const { html } = renderMarkdown(source, { hyphenate: "es" });
    const hyphenated = html
      .split("\n")
      .filter((line) => line.includes(SOFT_HYPHEN))
      .map((line) => line.replace(SHY, ""));
    expect(hyphenated).toEqual([
      expect.stringContaining("<p>Cuerpo internacionalización con <code>"),
      "<p>Cita internacionalización</p>",
      "<p>Alerta internacionalización</p>",
    ]);
    const body = html.split("\n").find((line) => line.replace(SHY, "").startsWith("<p>Cuerpo"))!;
    expect(body).toContain("<code>internacionalización</code>");
    expect(body).toContain(">https://example.com/internacionalizacion</a>");
  });

  it("are not added without a language with patterns", () => {
    expect(renderMarkdown(source).html).not.toContain(SOFT_HYPHEN);
    expect(renderMarkdown(source, { hyphenate: "ja" }).html).not.toContain(SOFT_HYPHEN);
  });

  it("are added for the PDF only, with the print-only justify rule", async () => {
    const dir = tempDir();
    const input = path.join(dir, "doc.md");
    writeFileSync(input, `${LONG}\n`);
    const pool = new BrowserPool();
    try {
      const pdf = await renderDocument(input, { config: false }, pool, true);
      expect(pdf.html).toContain(SOFT_HYPHEN);
      expect(pdf.html).toMatch(/@media print \{\s*\.markdown-body > p,[^}]*text-align: justify;/);

      const html = await renderDocument(input, { config: false }, pool, false);
      expect(html.html).not.toContain(SOFT_HYPHEN);

      const ragged = await renderDocument(
        input,
        { config: false, overrides: { justify: false } },
        pool,
        true,
      );
      expect(ragged.html).not.toContain(SOFT_HYPHEN);
      expect(ragged.html).not.toContain("text-align: justify");
    } finally {
      await pool.close();
    }
  });
});

interface Line {
  text: string;
  /** Where the line starts and ends, in PDF points. */
  left: number;
  right: number;
}

/** Text lines of page 1 (by baseline), with where each ends, in PDF points. */
async function lines(file: string): Promise<Line[]> {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)) });
  const page = await (await task.promise).getPage(1);
  const items = (await page.getTextContent()).items.filter(
    (item) => "str" in item && item.str.trim() !== "",
  ) as { str: string; transform: number[]; width: number }[];
  const byLine = new Map<number, Line>();
  for (const item of items) {
    const y = Math.round(item.transform[5]!);
    const line = byLine.get(y) ?? { text: "", left: Infinity, right: 0 };
    line.text += item.str;
    line.left = Math.min(line.left, item.transform[4]!);
    line.right = Math.max(line.right, item.transform[4]! + item.width);
    byLine.set(y, line);
  }
  await task.destroy();
  return [...byLine.entries()].sort((a, b) => b[0] - a[0]).map(([, line]) => line);
}

describe.skipIf(!browser && !browserRequired)("justified PDF", () => {
  // Letter, 10 mm margins: the text column ends at 612 - 28.35 pt.
  const RIGHT_EDGE = 612 - (10 * 72) / 25.4;

  const render = async (markdown: string, overrides = {}) => {
    const dir = tempDir();
    const input = path.join(dir, "doc.md");
    writeFileSync(input, markdown);
    const output = path.join(dir, "doc.pdf");
    await convertFile({ input, output, format: "pdf", config: false, overrides });
    return lines(output);
  };

  /** A word broken at the end of a line: a letter, the kept soft hyphen, and the "-". */
  const BROKEN = new RegExp(`\\p{L}${SOFT_HYPHEN}?-$`, "u");
  // The body starts at the left margin (28 pt), list items are indented; the page number is
  // centered near the bottom.
  const bodyLines = (result: Line[]) => result.filter((line) => line.left < 35);
  const listLines = (result: Line[]) => result.filter((line) => line.left > 40 && line.left < 100);

  it("fills the paragraph lines to the right margin, breaking words with hyphens", async () => {
    const paragraph = [LONG, LONG, LONG, LONG].join(" ");
    const result = await render(`${paragraph}\n\n- ${paragraph}\n`);
    const body = bodyLines(result);
    const list = listLines(result);
    expect(body.length).toBeGreaterThan(3);
    expect(list.length).toBeGreaterThan(3);

    // Every line but the last ends at the margin; the list's do not.
    for (const line of body.slice(0, -1)) {
      expect(Math.abs(line.right - RIGHT_EDGE), line.text).toBeLessThan(1.5);
    }
    expect(list.some((line) => RIGHT_EDGE - line.right > 5)).toBe(true);

    // Some line ends in a hyphen.
    expect(body.some((line) => BROKEN.test(line.text))).toBe(true);
    expect(body.map((line) => line.text).join(" ")).toContain("internacionalización");
  });

  it("keeps only the soft hyphens where a line breaks", async () => {
    const pool = new BrowserPool();
    try {
      const session = await pool.get();
      const page = await session.newPage();
      const words = Array.from({ length: 12 }, () => hyphenatorFor("es")!("internacionalización"));
      await page.setContent(
        `<p style="font: 16px serif; text-align: justify">La ${words.join(" de la ")}.</p>`,
      );
      await page.setViewport({ width: 300, height: 600 });
      const before = await page.evaluate(
        `document.body.textContent.split("${SOFT_HYPHEN}").length - 1`,
      );
      const kept = await page.evaluate(`(${SOFT_HYPHEN_CLEANUP})(300)`);
      // Each kept soft hyphen sits where a line now ends: the character after it is lower.
      const check = await page.evaluate(`(() => {
        const node = document.querySelector("p").firstChild;
        const range = document.createRange();
        const tops = (i) => { range.setStart(node, i); range.setEnd(node, i + 1);
          return [...range.getClientRects()].filter((r) => r.width > 0).map((r) => r.top); };
        const result = [];
        for (let i = 0; i < node.data.length; i++) {
          if (node.data[i] === "${SOFT_HYPHEN}") result.push(tops(i + 1).at(-1) > tops(i - 1)[0] + 1);
        }
        return { remaining: result.length, atLineEnds: result.filter(Boolean).length };
      })()`);
      expect(before).toBe(12 * 7);
      expect(kept).toBeGreaterThan(0);
      expect(check).toEqual({ remaining: kept, atLineEnds: kept });
      await page.close();
    } finally {
      await pool.close();
    }
  });

  it("keeps paragraphs ragged with justify off", async () => {
    const paragraph = [LONG, LONG, LONG, LONG].join(" ");
    const result = await render(`${paragraph}\n`, { justify: false });
    const body = bodyLines(result).slice(0, -1);
    expect(body.some((line) => RIGHT_EDGE - line.right > 5)).toBe(true);
    expect(body.some((line) => BROKEN.test(line.text))).toBe(false);
  });
});

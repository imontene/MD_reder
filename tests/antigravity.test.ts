import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/convert.js";
import { DEFAULT_OPTIONS, normalizeOptions } from "../src/options.js";
import {
  headerFooterStyle,
  isAntigravityTheme,
  mermaidThemeVariables,
} from "../src/render/antigravity.js";
import { headerFooterTemplate } from "../src/render/header-footer.js";
import { builtinThemeCss } from "../src/render/template.js";
import { browserRequired, tempDir, testBrowser } from "./helpers.js";

const browser = testBrowser();

describe("Anti-Gravity theme", () => {
  it("is the default, with antigravity-dark, light and dark to choose from", () => {
    expect(DEFAULT_OPTIONS.theme).toBe("antigravity");
    expect(normalizeOptions({ theme: "AntiGravity-Dark" }, "x", "/")).toEqual({
      theme: "antigravity-dark",
    });
    expect(normalizeOptions({ theme: "light" }, "x", "/")).toEqual({ theme: "light" });
    expect(isAntigravityTheme("antigravity-dark")).toBe(true);
    expect(isAntigravityTheme("light")).toBe(false);
  });

  it("carries the design system's colours in each variant", () => {
    const light = builtinThemeCss("antigravity").join("\n");
    for (const value of ["--ag-ink: #0f1419", "--ag-accent: #2456d3", "--ag-canvas: #ffffff"]) {
      expect(light).toContain(value);
    }
    const dark = builtinThemeCss("antigravity-dark").join("\n");
    for (const value of ["--ag-ink: #eef1f6", "--ag-accent: #7ea4ff", "background: #0b0e13"]) {
      expect(dark).toContain(value);
    }
    // The previous look is untouched.
    expect(builtinThemeCss("light").join("\n")).not.toContain("--ag-");
  });

  it("colours Mermaid's base theme from the tokens, for Anti-Gravity pages only", () => {
    expect(mermaidThemeVariables("antigravity")).toMatchObject({
      darkMode: false,
      primaryColor: "#ecf1fd",
      primaryBorderColor: "#2456d3",
      lineColor: "#636c7a",
      textColor: "#0f1419",
    });
    expect(mermaidThemeVariables("antigravity-dark")).toMatchObject({
      darkMode: true,
      background: "#0b0e13",
      primaryBorderColor: "#7ea4ff",
    });
    expect(mermaidThemeVariables("light")).toBeUndefined();
  });

  it("sets headers and footers like the system's slide footers", () => {
    const margin = { left: "10mm", right: "10mm" };
    const values = { title: "Informe" };
    const mono = headerFooterTemplate(
      "{title}",
      values,
      margin,
      "manrope",
      headerFooterStyle("antigravity"),
    );
    expect(mono).toContain("font-family: 'JetBrains Mono'");
    expect(mono).toContain("text-transform: uppercase");
    expect(mono).toContain("color: #636c7a");
    expect(mono).toContain("font-family: 'JetBrains Mono';"); // its own copy of the font
    expect(headerFooterStyle("antigravity-dark").color).toBe("#8f98a7");

    const plain = headerFooterTemplate(
      "{title}",
      values,
      margin,
      "manrope",
      headerFooterStyle("light"),
    );
    expect(plain).not.toContain("uppercase");
    expect(plain).toContain("color: #59636e");
  });
});

/** Fill colours (as #rrggbb) and pattern fills (gradients) of each page. */
async function pageFills(file: string): Promise<{ colors: Set<string>; patterns: number }[]> {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)) });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const ops = await (await doc.getPage(i)).getOperatorList();
    const colors = new Set<string>();
    let patterns = 0;
    ops.fnArray.forEach((fn, j) => {
      if (fn === OPS.setFillRGBColor) colors.add(String(ops.argsArray[j]![0]));
      if (fn === OPS.setFillColorN) patterns++;
    });
    pages.push({ colors, patterns });
  }
  await task.destroy();
  return pages;
}

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

describe.skipIf(!browser && !browserRequired)("Anti-Gravity PDF", () => {
  const document = [
    "---",
    "title: Informe",
    "subtitle: Una frase que explica el documento.",
    "author: Equipo",
    "date: 2026-10-22",
    "header: '{title} | | {date}'",
    "---",
    "",
    "Texto del documento con un [enlace](https://example.com).",
    "",
    "```mermaid",
    "flowchart LR",
    "  A[Pregunta] --> B[Artefacto]",
    "```",
    "",
    '<div style="break-before: page"></div>',
    "",
    "Segunda página.",
    "",
  ].join("\n");

  const render = async (theme?: string) => {
    const dir = tempDir();
    const input = path.join(dir, "doc.md");
    writeFileSync(input, document);
    const output = path.join(dir, "doc.pdf");
    const result = await convertFile({
      input,
      output,
      format: "pdf",
      config: false,
      overrides: theme ? { theme } : {},
    });
    expect(result.diagnostics).toEqual([]);
    return { output, pages: await pageFills(output) };
  };

  it("prints the default theme with its fonts, accent and a field on the first page only", async () => {
    const { output, pages } = await render();
    expect(pages.length).toBe(2);
    const raw = readFileSync(output).toString("latin1");
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Manrope\w*-SemiBold/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+JetBrainsMono-Regular/); // eyebrow, header
    expect(raw).not.toMatch(/\/BaseFont \/[A-Z]{6}\+(DejaVu|Liberation|Arial|Helvetica)/);
    expect(pages[0]!.colors).toContain("#2456d3"); // accent: eyebrow, link, diagram
    expect(pages[0]!.patterns).toBeGreaterThan(0);
    expect(pages[1]!.patterns).toBe(0);

    // Header in uppercase on both pages (pdf.js spaces out the tracked letters: drop spaces).
    for (const text of await pageTexts(output)) {
      expect(text.replace(/\s+/g, "")).toContain("INFORME");
    }
  });

  it("paints every page of the dark stage", async () => {
    const { pages } = await render("antigravity-dark");
    for (const page of pages) expect(page.colors).toContain("#0b0e13");
    expect(pages[0]!.colors).toContain("#7ea4ff");
  });

  it("keeps the previous look with --theme light", async () => {
    const { pages } = await render("light");
    for (const page of pages) expect(page.patterns).toBe(0);
    expect(pages[0]!.colors).not.toContain("#2456d3");
  });
});

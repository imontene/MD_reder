import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeOptions, normalizeOptions, resolveMargins } from "../src/options.js";
import {
  coverNumber,
  cssString,
  magazinePage,
  type MagazineInput,
} from "../src/render/magazine.js";
import { builtinThemeCss } from "../src/render/template.js";
import { tempDir } from "./helpers.js";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';

function page(front: Record<string, unknown> = {}, extra: Partial<MagazineInput> = {}) {
  const options = mergeOptions(
    normalizeOptions({ theme: "tech_magazine", ...front }, "front matter", process.cwd()),
  );
  return magazinePage({
    options,
    margin: resolveMargins(options),
    baseDir: tempDir(),
    hasCover: true,
    values: { title: "Título", date: options.date },
    ...extra,
  });
}

describe("coverNumber", () => {
  it("takes the last group of digits of the file name", () => {
    expect(coverNumber("cover02.png")).toBe(2);
    expect(coverNumber("2026-portada-3.jpg")).toBe(3);
    expect(coverNumber("portada.png")).toBeUndefined();
  });
});

describe("magazine options", () => {
  it("validates the front matter fields", () => {
    const parsed = normalizeOptions(
      { "magazine-name": "Mía", cover: "02", "cover-text": "Bottom", "cover-ink": "dark" },
      "front matter",
      process.cwd(),
    );
    expect(parsed).toEqual({
      magazineName: "Mía",
      cover: 2,
      coverText: "bottom",
      coverInk: "dark",
    });
    expect(normalizeOptions({ accent: "#2F6BFF" }, "fm", "/")).toEqual({ accent: "#2F6BFF" });
    expect(() => normalizeOptions({ magazine_name: "../x" }, "fm", "/")).toThrow("folder");
    expect(() => normalizeOptions({ accent: "red; x" }, "fm", "/")).toThrow("CSS colour");
    expect(() => normalizeOptions({ cover: "uno" }, "fm", "/")).toThrow("number");
  });

  it("sets justified text in Inter, with 16 mm side margins", () => {
    for (const theme of ["tech_magazine", "tech_magazine-dark"]) {
      expect(mergeOptions({ theme })).toMatchObject({
        margin: "20mm 16mm 22mm",
        font: "inter",
        justify: true,
      });
      // --no-justify still turns it off.
      expect(mergeOptions({ theme }, { justify: false })).toMatchObject({ justify: false });
    }
  });

  it("keeps the pull quotes ragged in the justified column", () => {
    expect(builtinThemeCss("tech_magazine").join("\n")).toMatch(
      /\.markdown-body > blockquote:not\(\.markdown-alert\) > p:not\(\.markdown-alert-title\) \{\s*text-align: left;/,
    );
  });
});

describe("magazinePage", () => {
  it("uses the AlphaZeroChess covers by default, with their own ink", () => {
    const inks = [1, 2, 3, 4].map((cover) => page({ cover }).headerClass);
    expect(inks).toEqual([
      "cover-ink-dark cover-text-top",
      "cover-ink-light cover-text-top",
      "cover-ink-dark cover-text-top",
      "cover-ink-light cover-text-top",
    ]);
    // The magazine's setting for a cover wins over cover-ink.
    expect(page({ cover: 1, "cover-ink": "light" }).headerClass).toContain("cover-ink-dark");
    const result = page({ cover: 2, "cover-text": "bottom" });
    expect(result.headerClass).toBe("cover-ink-light cover-text-bottom");
    expect(result.css).toContain('url("data:image/png;base64,iVBORw0KGgo');
    expect(result.css).toContain("linear-gradient(to top, rgba(8, 14, 28, 0.85)");
    expect(result.css).toContain('.doc-header::before { content: "AlphaZeroChess"; }');
    expect(result.diagnostics).toEqual([]);
  });

  it("picks a random cover when none is given, and warns about a missing one", () => {
    expect(page({}, { random: () => 0 }).coverNumber).toBe(1);
    expect(page({}, { random: () => 0.99 }).coverNumber).toBe(4);
    const missing = page({ cover: 9 }, { random: () => 0.5 });
    expect(missing.coverNumber).toBe(3);
    expect(missing.diagnostics[0]!.message).toContain("cover 9 not found");
    expect(missing.diagnostics[0]!.message).toContain("available: 1, 2, 3, 4");
  });

  it("takes the accent from the magazine, then from the front matter", () => {
    expect(page({ cover: 1 }).css).toContain("--tm-accent: #2f6bff;");
    expect(page({ cover: 1, accent: "#b0562b" }).css).toContain("--tm-accent: #b0562b;");
  });

  it("finds a magazine next to the document first", () => {
    const baseDir = tempDir();
    const folder = path.join(baseDir, "tech_magazine", "Propia");
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "foto7.svg"), SVG);
    writeFileSync(path.join(folder, "notas.txt"), "no es una imagen");
    const result = page({ "magazine-name": "Propia" }, { baseDir });
    expect(result.coverNumber).toBe(7);
    expect(result.headerClass).toBe("cover-ink-light cover-text-top"); // no magazine.json
    expect(result.css).toContain('url("data:image/svg+xml;base64,');
    expect(result.css).not.toContain("--tm-accent"); // the theme's own accent
  });

  it("prints a cover without a picture when the magazine has none", () => {
    const result = page({ "magazine-name": "Inexistente" });
    expect(result.coverNumber).toBeUndefined();
    expect(result.diagnostics[0]!.message).toContain(
      "no cover pictures in tech_magazine/Inexistente",
    );
  });

  it("draws the margins, header and footer, with none on the cover", () => {
    const css = page({ cover: 1, date: "Noviembre de 2026" }).css;
    expect(css).toContain("margin: 20mm 16mm 22mm 16mm;");
    expect(css).toContain('@bottom-left { content: "AlphaZeroChess · Noviembre de 2026"; }');
    expect(css).toContain("@bottom-right { content: counter(page); }");
    expect(css).toMatch(/@page :first \{\n {2}margin: 0;\n {2}@top-left \{ content: none; \}/);
    expect(css).toContain('.doc-header::after { content: "Noviembre de 2026"; }');

    const custom = page({ header: "{title} | | {page} de {pages}", "page-numbers": false }).css;
    expect(custom).toContain('@top-left { content: "Título"; }');
    expect(custom).toContain('@top-right { content: counter(page) " de " counter(pages); }');
    expect(custom).not.toContain("@bottom-right { content: counter(page)");
  });

  it("has no cover without a title", () => {
    const result = page({ cover: 1 }, { hasCover: false });
    expect(result.headerClass).toBeUndefined();
    expect(result.css).not.toContain("@page :first");
    expect(result.css).not.toContain("data:image");
  });

  it("writes CSS strings safely", () => {
    expect(cssString('A "B" \\ C\nD')).toBe('"A \\"B\\" \\\\ C D"');
  });
});

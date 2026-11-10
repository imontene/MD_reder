import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeOptions, normalizeOptions, resolveMargins } from "../src/options.js";
import type { Diagnostic } from "../src/diagnostics.js";
import {
  coverNumber,
  cssString,
  findMagazine,
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

describe("bundled magazines", () => {
  /** sha256 of the covers as published in 2.14.1 (and of the project's originals). */
  const COVERS_SHA256: Record<string, string> = {
    "cover01.png": "402d4ddb62cdfdfe283a4f13fdd4e8610c7123bb43773b1ec6edb0c7fd65e2d8",
    "cover02.png": "89893a626dff29b05f375f437a52f57cf4d07aee7b04196755dd224ee6e1991f",
    "cover03.png": "cb4fb524226a71dbd1c922de13c37911e376510b06527e4e9c3e966ec55fd79a",
    "cover04.png": "a171fd49800f0221c37040a0ee33b304237a54b48303260a5203e2a19d7c297e",
    "magazine.json": "5686e2b7d7c75fa01f68283257b48a6aabbedfa92bdd874ae85a3044cf367ae7",
  };
  const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

  it("ship Introspect with the same four covers, inks and accent as AlphaZeroChess", () => {
    for (const name of ["Introspect", "AlphaZeroChess"]) {
      const diagnostics: Diagnostic[] = [];
      const folder = findMagazine(name, tempDir(), diagnostics);
      expect(diagnostics).toEqual([]);
      expect(folder.where).toBe(`tech_magazine/${name}`);
      expect(folder.covers.map((cover) => cover.number)).toEqual([1, 2, 3, 4]);
      expect(folder.settings.accent).toBe("#2f6bff");
      expect([1, 2, 3, 4].map((n) => folder.settings.covers?.[String(n)]?.ink)).toEqual([
        "dark",
        "light",
        "dark",
        "light",
      ]);
      for (const file of Object.keys(COVERS_SHA256)) {
        const bytes = readFileSync(path.join("tech_magazine", name, file));
        expect(sha256(bytes), `${name}/${file}`).toBe(COVERS_SHA256[file]);
      }
    }
  });

  it("print an Introspect cover with its name in the masthead and the footer", () => {
    const introspect = page({ "magazine-name": "Introspect", cover: 1 });
    expect(introspect.diagnostics).toEqual([]);
    expect(introspect.coverNumber).toBe(1);
    const picture = readFileSync("tech_magazine/Introspect/cover01.png").toString("base64");
    expect(introspect.css).toContain(`url("data:image/png;base64,${picture}")`);
    expect(introspect.css).toContain('.doc-header::before { content: "Introspect"; }');
    expect(introspect.css).toContain('@bottom-left { content: "Introspect"; }');
    expect(introspect.css).not.toContain("AlphaZeroChess");

    // AlphaZeroChess prints as before: the same picture, under its own name.
    const alpha = page({ "magazine-name": "AlphaZeroChess", cover: 1 });
    expect(alpha.diagnostics).toEqual([]);
    expect(alpha.css).toBe(introspect.css.replaceAll("Introspect", "AlphaZeroChess"));
    expect(page({ cover: 1 }).css).toBe(alpha.css); // still the default
  });

  it("still prefer a local Introspect folder next to the document", () => {
    const baseDir = tempDir();
    const folder = path.join(baseDir, "tech_magazine", "Introspect");
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "portada5.svg"), SVG);
    const result = page({ "magazine-name": "Introspect" }, { baseDir });
    expect(result.coverNumber).toBe(5);
    expect(result.css).toContain('url("data:image/svg+xml;base64,');
  });

  it("are packed with their own licence", () => {
    const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    const files = (JSON.parse(out) as { files: { path: string }[] }[])[0]!.files.map((f) => f.path);
    for (const name of ["AlphaZeroChess", "Introspect"]) {
      for (const file of Object.keys(COVERS_SHA256)) {
        expect(files).toContain(`tech_magazine/${name}/${file}`);
      }
    }
    expect(files).toContain("tech_magazine/LICENSE.md");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { license: string };
    expect(pkg.license).toBe("MIT AND CC-BY-NC-ND-4.0");
    expect(readFileSync("LICENSE", "utf8")).toContain("tech_magazine/LICENSE.md");
    expect(readFileSync("tech_magazine/LICENSE.md", "utf8")).toContain("CC BY-NC-ND 4.0");
  }, 60_000);
});

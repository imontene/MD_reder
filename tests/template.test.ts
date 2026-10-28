import { describe, expect, it } from "vitest";
import { fontFaceCss, fontStack, serifFontFaceCss } from "../src/render/fonts.js";
import {
  buildHtmlDocument,
  builtinThemeCss,
  escapeHtml,
  plainAuthor,
} from "../src/render/template.js";

describe("fontFaceCss", () => {
  const css = fontFaceCss();

  it("embeds Manrope by default, with Inter for the glyphs it lacks", () => {
    for (const weight of [400, 600, 700]) {
      expect(css).toMatch(
        new RegExp(
          `font-family: 'Manrope';\\s+font-style: normal;\\s+font-display: block;\\s+font-weight: ${weight};`,
        ),
      );
    }
    expect(css).toMatch(/font-family: "Inter";\s+font-style: normal;\s+font-weight: 400;/);
    expect(css).toMatch(/font-family: "Inter";\s+font-style: normal;\s+font-weight: 700;/);
    expect(css).not.toMatch(/font-family: "Inter";\s+font-style: italic;/);
  });

  it("embeds Inter in the weights the theme uses with --font inter", () => {
    const inter = fontFaceCss("inter");
    for (const weight of [400, 600, 700]) {
      expect(inter).toMatch(
        new RegExp(`font-family: "Inter";\\s+font-style: normal;\\s+font-weight: ${weight};`),
      );
    }
    expect(inter).toMatch(/font-family: "Inter";\s+font-style: italic;/);
    expect(inter).not.toContain("Manrope");
  });

  it("gives each font its stack, Inter first falling back to the system", () => {
    expect(fontStack("manrope")).toBe(`"Manrope", "Inter", system-ui, sans-serif`);
    expect(fontStack("inter")).toBe(`"Inter", system-ui, sans-serif`);
  });

  it("embeds JetBrains Mono for code", () => {
    expect(css).toContain("font-family: 'JetBrains Mono'");
  });

  it("is fully self-contained", () => {
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(6);
    for (const url of urls) expect(url).toMatch(/^data:font\/woff2;base64,/);
    expect(css).not.toContain("font-display: swap");
  });
});

describe("buildHtmlDocument", () => {
  it("wraps the body with title, fonts and theme", () => {
    const html = buildHtmlDocument({ title: "A & <B>", body: "<p>hola</p>" });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>A &amp; &lt;B&gt;</title>");
    expect(html).toContain('<main class="markdown-body">\n<p>hola</p>');
    expect(html).toContain('--font-text: "Manrope", "Inter"');
  });

  it("escapes HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("academic_basic theme", () => {
  it("embeds STIX Two Text in regular and bold, each with its italic", () => {
    const css = serifFontFaceCss();
    for (const weight of [400, 700]) {
      for (const style of ["normal", "italic"]) {
        expect(css).toMatch(
          new RegExp(
            `font-family: 'STIX Two Text';\\s+font-style: ${style};\\s+font-display: block;\\s+font-weight: ${weight};`,
          ),
        );
      }
    }
    expect(css).not.toMatch(/url\((?!data:font\/woff2)/);
    const theme = builtinThemeCss("academic_basic");
    expect(theme[0]).toBe(css);
    expect(theme.join("\n")).toContain("columns: 2;");
    expect(builtinThemeCss("light").join("\n")).not.toContain("STIX Two Text");
  });
});

describe("title block", () => {
  const html = buildHtmlDocument({
    title: "Cinética",
    body: "",
    lang: "en",
    showTitle: true,
    kicker: "Research article",
    author: "Ana Pérez^1^, Luis <Gómez>^1,2^",
    date: "2026",
    affiliations: ["Uno", "Dos"],
    abstract: "Primero.\n\nSegundo.",
    keywords: ["a", "b"],
  });

  it("shows kicker, authors with superscripts, affiliations, abstract and keywords", () => {
    expect(html).toContain('<p class="doc-kicker">Research article</p>\n<h1 class="doc-title">');
    expect(html).toContain(
      '<p class="doc-meta">Ana Pérez<sup>1</sup>, Luis &lt;Gómez&gt;<sup>1,2</sup> · 2026</p>',
    );
    expect(html).toContain(
      '<ol class="doc-affiliations"><li><sup>1</sup>Uno</li><li><sup>2</sup>Dos</li></ol>',
    );
    expect(html).toContain(
      '<section class="doc-abstract">\n<p class="doc-abstract-title">Abstract</p>\n<p>Primero.</p>\n<p>Segundo.</p>\n</section>',
    );
    expect(html).toContain(
      '<p class="doc-keywords"><span class="doc-keywords-label">Keywords:</span> a, b</p>',
    );
  });

  it("keeps the affiliation marks out of the metadata", () => {
    expect(html).toContain('<meta name="author" content="Ana Pérez, Luis &lt;Gómez&gt;">');
    expect(plainAuthor("Ana^1^ y Luis^2,3^")).toBe("Ana y Luis");
  });
});

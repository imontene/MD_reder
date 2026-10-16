import { describe, expect, it } from "vitest";
import { fontFaceCss, fontStack } from "../src/render/fonts.js";
import { buildHtmlDocument, escapeHtml } from "../src/render/template.js";

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

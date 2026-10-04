import { describe, expect, it } from "vitest";
import { fontFaceCss } from "../src/render/fonts.js";
import { buildHtmlDocument, escapeHtml } from "../src/render/template.js";

describe("fontFaceCss", () => {
  const css = fontFaceCss();

  it("embeds Inter in the weights the theme uses", () => {
    for (const weight of [400, 600, 700]) {
      expect(css).toMatch(
        new RegExp(`font-family: "Inter";\\s+font-style: normal;\\s+font-weight: ${weight};`),
      );
    }
    expect(css).toMatch(/font-family: "Inter";\s+font-style: italic;/);
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
    expect(html).toContain('--font-text: "Inter"');
  });

  it("escapes HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});

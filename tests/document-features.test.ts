import { describe, expect, it } from "vitest";
import { strings } from "../src/i18n.js";
import { renderMarkdown } from "../src/markdown/index.js";
import { buildToc, tocPlaceholder, type Heading } from "../src/markdown/toc.js";
import { headerFooterTemplate } from "../src/render/header-footer.js";

describe("syntax highlighting", () => {
  it("highlights known languages", () => {
    const { html } = renderMarkdown("```ts\nconst x = 1; // hola\n```");
    expect(html).toContain('<pre class="hljs"><code class="language-ts">');
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    expect(html).toContain('<span class="hljs-comment">// hola</span>');
  });

  it("escapes unknown languages and code without a language", () => {
    const { html } = renderMarkdown("```foo\n<b>x</b>\n```\n\n```\n<i>y</i>\n```");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;y&lt;/i&gt;");
    expect(html).not.toContain("hljs");
  });
});

describe("alerts", () => {
  it("turns [!NOTE] blockquotes into titled callouts", () => {
    const { html } = renderMarkdown("> [!NOTE]\n> Texto **importante**.");
    expect(html).toContain('<blockquote class="markdown-alert markdown-alert-note">');
    expect(html).toContain('<p class="markdown-alert-title">Note</p>');
    expect(html).toContain("<p>Texto <strong>importante</strong>.</p>");
    expect(html).not.toContain("[!NOTE]");
  });

  it("translates titles with the document language", () => {
    const { html } = renderMarkdown("> [!caution]\n> Cuidado.", { lang: "es-AR" });
    expect(html).toContain("markdown-alert-caution");
    expect(html).toContain(">Precaución</p>");
  });

  it("supports a marker alone in its paragraph", () => {
    const { html } = renderMarkdown("> [!TIP]\n>\n> Párrafo aparte.");
    expect(html).toContain('<p class="markdown-alert-title">Tip</p>\n<p>Párrafo aparte.</p>');
  });

  it("leaves other blockquotes alone", () => {
    const { html } = renderMarkdown("> [!OTRO]\n> x\n\n> texto [!NOTE]");
    expect(html).not.toContain("markdown-alert");
  });
});

describe("footnotes", () => {
  it("renders references and the notes section", () => {
    const { html } = renderMarkdown("Texto[^1].\n\n[^1]: La nota.");
    expect(html).toContain('<sup class="footnote-ref"><a href="#fn1" id="fnref1">[1]</a></sup>');
    expect(html).toContain('<section class="footnotes">');
    expect(html).toContain("La nota.");
  });
});

describe("table of contents", () => {
  const h = (level: number, id: string): Heading => ({ level, id, html: id });

  it("nests headings and skips a single level-1 title", () => {
    const toc = buildToc([h(1, "t"), h(2, "a"), h(3, "a1"), h(2, "b")], 3, "Contents");
    expect(toc).toContain(
      '<ul><li><a href="#a">a</a><ul><li><a href="#a1">a1</a></li></ul></li><li><a href="#b">b</a></li></ul>',
    );
    expect(toc).not.toContain('href="#t"');
    expect(toc).toContain('<p class="toc-title">Contents</p>');
  });

  it("keeps level-1 headings when there are several, and respects the depth", () => {
    const toc = buildToc([h(1, "a"), h(2, "a1"), h(1, "b"), h(3, "deep")], 1, "C");
    expect(toc).toContain('<ul><li><a href="#a">a</a></li><li><a href="#b">b</a></li></ul>');
    expect(toc).not.toContain("a1");
  });

  it("nests skipped levels under an empty item", () => {
    const toc = buildToc([h(2, "a"), h(4, "x")], 4, "C");
    expect(toc).toContain('<li><a href="#a">a</a><ul><li><ul><li><a href="#x">x</a>');
  });

  it("is empty without headings", () => {
    expect(buildToc([], 3, "C")).toBe("");
  });

  it("collects heading ids and inline code, and marks [[toc]]", () => {
    const md = renderMarkdown("# T\n\n[[toc]]\n\n## Uso de `mdrender`\n\n## Fin");
    expect(md.hasTocMarker).toBe(true);
    expect(md.html).toContain(tocPlaceholder(md.nonce));
    expect(md.headings.map((x) => [x.level, x.html])).toEqual([
      [1, "T"],
      [2, "Uso de <code>mdrender</code>"],
      [2, "Fin"],
    ]);
    expect(md.headings[1]!.id).toMatch(/^uso-de-/);
  });

  it("uses translated titles", () => {
    expect(strings("es").toc).toBe("Contenido");
    expect(strings("xx").toc).toBe("Contents");
  });
});

describe("header and footer templates", () => {
  const margin = { left: "20mm", right: "15mm" };
  const values = { title: "Informe <1>", author: "Ana", date: "2026-10-04" };

  it("centers a single column and replaces placeholders", () => {
    const html = headerFooterTemplate("Página {page} de {pages}", values, margin);
    expect(html).toMatch(
      /text-align: center;">Página <span class="pageNumber"><\/span> de <span class="totalPages"><\/span><\/span>/,
    );
    expect(html).toContain("padding: 0 15mm 0 20mm;");
    expect(html).toContain('font-family: "Inter"');
  });

  it("splits left | center | right and escapes values", () => {
    const html = headerFooterTemplate("{title} | {author} | {date}", values, margin);
    expect(html).toContain('text-align: left;">Informe &lt;1&gt;</span>');
    expect(html).toContain('text-align: center;">Ana</span>');
    expect(html).toContain('text-align: right;">2026-10-04</span>');
  });

  it("puts two columns at the edges and keeps escaped bars and unknown placeholders", () => {
    const html = headerFooterTemplate("A \\| B | {nada}", values, margin);
    expect(html).toContain('text-align: left;">A | B</span>');
    expect(html).toContain('text-align: right;">{nada}</span>');
  });
});

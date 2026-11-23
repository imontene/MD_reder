import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/markdown/index.js";
import { mergeOptions, normalizeOptions, resolveMargins } from "../src/options.js";
import { pageCss } from "../src/render/page-css.js";
import { preprintPage } from "../src/render/preprint.js";

const options = (front: Record<string, unknown> = {}) =>
  mergeOptions(normalizeOptions({ theme: "preprint", ...front }, "front matter", process.cwd()));

describe("preprint options", () => {
  it("sets a LaTeX article page and numbers the sections", () => {
    expect(options()).toMatchObject({
      margin: "30mm 32mm 28mm",
      fontSize: "10pt",
      justify: true,
      numberSections: true,
    });
    expect(options({ "number-sections": false }).numberSections).toBe(false);
    expect(options({ "preprint-stamp": "x:1" }).preprintStamp).toBe("x:1");
  });
});

describe("preprintPage", () => {
  const page = (front: Record<string, unknown> = {}) => {
    const o = options(front);
    return preprintPage({
      options: o,
      margin: resolveMargins(o),
      values: { title: "T", date: o.date },
    });
  };

  it("sets the running head from page 2 and the folio centred", () => {
    const css = page({ date: "22 de noviembre de 2026" });
    expect(css).toContain("margin: 30mm 32mm 28mm 32mm;");
    expect(css).toContain('@top-right { content: "Preprint — 22 de noviembre de 2026"; }');
    expect(css).toContain("@bottom-center { content: counter(page); }");
    expect(css).toMatch(/@page :first \{\n {2}@top-left \{ content: none; \}/);
    expect(css).not.toMatch(/@page :first \{[^}]*@bottom-center \{ content: none/);
    expect(page()).toContain('@top-right { content: "Preprint"; }');
  });

  it("adds the stamp only when the author gives one", () => {
    expect(page()).not.toContain("@left-middle");
    expect(page({ "preprint-stamp": 'id "v1"' })).toContain(
      '@left-middle { content: "id \\"v1\\""; }',
    );
  });

  it("follows --header, --footer and --no-page-numbers", () => {
    const css = page({ header: "{title} | |", "page-numbers": false });
    expect(css).toContain('@top-left { content: "T"; }');
    expect(css).not.toContain("counter(page)");
  });
});

describe("pageCss", () => {
  it("writes counters and placeholders as CSS content", () => {
    const css = pageCss({
      margin: { top: "1mm", right: "2mm", bottom: "3mm", left: "4mm" },
      footer: "{magazine} | | {page} de {pages}",
      values: { magazine: 'A "B"' },
    });
    expect(css).toContain('@bottom-left { content: "A \\"B\\""; }');
    expect(css).toContain('@bottom-right { content: counter(page) " de " counter(pages); }');
    expect(css).not.toContain(":first");
  });
});

describe("numbered sections", () => {
  const md = [
    "## Uno",
    "### Sub",
    "#### Hondo",
    "## Dos",
    "## Referencias",
    "1. Autor A. Título.",
    "[[backmatter]]",
    "## Financiamiento",
  ].join("\n\n");

  it("numbers ## and ### before the back matter, as real text for the index", () => {
    const { html, headings } = renderMarkdown(md, { numberSections: "plain" });
    expect(html).toContain('<h2 id="uno"><span class="secnum">1</span> Uno</h2>');
    expect(html).toContain('<h3 id="sub"><span class="secnum">1.1</span> Sub</h3>');
    expect(html).toContain('<h4 id="hondo">Hondo</h4>');
    expect(html).toContain('<h2 id="dos"><span class="secnum">2</span> Dos</h2>');
    // The references and the back matter are not numbered.
    expect(html).toContain('<h2 id="referencias">Referencias</h2>');
    expect(html).toContain('<div class="backmatter">\n<h2 id="financiamiento">Financiamiento</h2>');
    expect(html).toMatch(/<\/h2>\n<\/div>\n?$/);
    expect(headings[0]!.html).toBe('<span class="secnum">1</span> Uno');
    expect(renderMarkdown(md, { numberSections: "dotted" }).html).toContain(
      '<span class="secnum">1.1.</span> Sub',
    );
  });

  it("marks the list of references and the back matter in every theme", () => {
    const { html } = renderMarkdown(md);
    expect(html).not.toContain("secnum");
    expect(html).toContain('<ol class="references">');
    expect(html).toContain('<div class="backmatter">');
  });
});

describe("table captions and equations", () => {
  const table = "| a |\n| - |\n| 1 |";

  it("takes Pandoc's Table: caption before or after a table, numbered by the theme", () => {
    for (const md of [
      `Table: Texto *en* cursiva.\n\n${table}`,
      `${table}\n\n: Texto *en* cursiva.`,
    ]) {
      expect(renderMarkdown(md, { captions: true }).html).toContain(
        '<caption class="caption-numbered">Texto <em>en</em> cursiva.</caption>',
      );
    }
    expect(renderMarkdown("Table: sola", { captions: true }).html).toBe("<p>Table: sola</p>\n");
    expect(renderMarkdown(`Table: x\n\n${table}`).html).toContain("<p>Table: x</p>");
  });

  it("leaves formulas that number themselves out of the count", () => {
    expect(renderMarkdown("$$\nx = 1 \\tag{A}\n$$").html).toContain(
      '<div class="math-display math-tagged">',
    );
    expect(renderMarkdown("$$\nx = 1 \\notag\n$$").html).toContain("math-tagged");
    expect(renderMarkdown("$$\nx = 1\n$$").html).toContain('<div class="math-display">');
  });
});

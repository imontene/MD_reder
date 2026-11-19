import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/markdown/index.js";

const fixturesDir = path.resolve("tests/fixtures");
const TABLE = "| a | b |\n| - | - |\n| 1 | 2 |\n";
const render = (md: string, captions = true) =>
  renderMarkdown(md, { baseDir: fixturesDir, figures: true, captions }).html;

describe("table captions", () => {
  it("move a labelled paragraph before or after a table into its caption", () => {
    for (const md of [
      `**Tabla 1.** Datos *medidos*.\n\n${TABLE}`,
      `${TABLE}\n**Tabla 1.** Datos *medidos*.\n`,
    ]) {
      const html = render(md);
      expect(html).toMatch(
        /^<table>\n<caption><strong>Tabla 1\.<\/strong> Datos <em>medidos<\/em>\.<\/caption>\n<thead>/,
      );
      expect(html).not.toContain("<p>");
    }
  });

  it("know the label in other languages", () => {
    for (const label of ["Table 2:", "Cuadro 3.", "Tabela 4.", "Tableau 5.", "Tabelle 6."]) {
      expect(render(`**${label}** Texto.\n\n${TABLE}`)).toContain(`<caption><strong>${label}`);
    }
  });

  it("leave other paragraphs alone", () => {
    // Not next to a table, label not first, label not bold, or without the option.
    expect(render("**Tabla 1.** Texto.\n\nOtro párrafo.\n")).toContain("<p><strong>Tabla 1.");
    expect(render(`Ver la **Tabla 1.** abajo.\n\n${TABLE}`)).not.toContain("<caption>");
    expect(render(`Tabla 1. Texto.\n\n${TABLE}`)).not.toContain("<caption>");
    expect(render(`**Tabla 1.** Texto.\n\n${TABLE}`, false)).not.toContain("<caption>");
    // One caption per table: a second labelled paragraph stays a paragraph.
    const two = render(`**Tabla 1.** Uno.\n\n${TABLE}\n**Tabla 1.** Dos.\n`);
    expect(two.match(/<caption>/g)).toHaveLength(1);
    expect(two).toContain("<p><strong>Tabla 1.</strong> Dos.</p>");
  });
});

describe("diagram and figure captions", () => {
  const diagram = "```mermaid\nflowchart LR\n  A --> B\n```\n";

  it("put a labelled paragraph next to a Mermaid diagram under it, in its figure", () => {
    for (const md of [
      `${diagram}\n**Figura 2.** El esquema.\n`,
      `**Figura 2.** El esquema.\n\n${diagram}`,
    ]) {
      const html = render(md);
      expect(html).toMatch(
        /^<figure class="mermaid-diagram"><!--mermaid:[0-9a-f]+:0-->\n<figcaption><strong>Figura 2\.<\/strong> El esquema\.<\/figcaption><\/figure>/,
      );
      expect(html).not.toContain("<p>");
    }
    // Under a heading, the diagram keeps its caption inside the block kept with the heading.
    const headed = render(`## Esquema\n\n${diagram}\n**Figure 2.** Scheme.\n`);
    expect(headed).toMatch(
      /<div class="keep-with-heading">\n<h2[^]*<figcaption><strong>Figure 2\.<\/strong> Scheme\.<\/figcaption><\/figure>\n<\/div>/,
    );
    expect(render(`${diagram}\n**Figura 2.** El esquema.\n`, false)).not.toContain("<figcaption>");
  });

  it("style a labelled paragraph next to a lone image as a caption, in place", () => {
    const html = render("![Curva](img/gradiente.png)\n\n**Figura 3.** Nota sobre la curva.\n");
    expect(html).toContain(
      '<p class="caption"><strong>Figura 3.</strong> Nota sobre la curva.</p>',
    );
    expect(html.indexOf("<figure")).toBeLessThan(html.indexOf('<p class="caption">'));
  });

  it("make an image with its caption on the next line a figure captioned as written", () => {
    // With a hard break (backslash) or a plain line break between them.
    for (const gap of ["\\\n", "\n"]) {
      const html = render(`![Paseo](img/gradiente.png)${gap}**Figura 2.** El *modelo*.\n`);
      expect(html).toMatch(
        /^<figure class="figure figure-labelled">\n<img src="data:image\/png;base64,[^"]+" alt="Paseo">\n<figcaption><strong>Figura 2\.<\/strong> El <em>modelo<\/em>\.<\/figcaption>\n<\/figure>/,
      );
    }
    // #wide still spans both columns.
    expect(render("![x](img/gradiente.png#wide)\\\n**Figure 3.** Wide.\n")).toContain(
      '<figure class="figure figure-wide figure-labelled">',
    );
    // Not a label, or without the option: an ordinary paragraph, as before.
    expect(render("![x](img/gradiente.png)\\\nTexto suelto.\n")).toContain("<p><img");
    expect(render("![x](img/gradiente.png)\\\n**Figura 2.** Texto.\n", false)).toContain("<p><img");
  });
});

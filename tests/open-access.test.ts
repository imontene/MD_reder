import { describe, expect, it } from "vitest";
import { mergeOptions, normalizeOptions, resolveMargins } from "../src/options.js";
import { shortAuthors, vancouverCitation, vancouverName, yearOf } from "../src/render/authors.js";
import {
  authorNames,
  citation,
  openAccessFront,
  openAccessPage,
} from "../src/render/open-access.js";
import { buildHtmlDocument } from "../src/render/template.js";

const options = (front: Record<string, unknown> = {}) =>
  mergeOptions(normalizeOptions({ theme: "open_access", ...front }, "front matter", process.cwd()));

const RECORD = {
  journal: "Ciencia Abierta",
  "article-type": "Artículo de investigación",
  authors: [
    {
      name: "Ana Pérez",
      affiliations: [1],
      orcid: "0000-0000-0000-0001",
      email: "ana@ejemplo.org",
      corresponding: true,
    },
    { name: "Luis Gómez", affiliations: [1, 2] },
    { name: "Marta Ruiz", affiliations: 2 },
  ],
  affiliations: ["Universidad de Ejemplo", "Instituto de Ejemplo"],
  volume: 4,
  "article-number": "e0042",
  doi: "10.0000/ejemplo.0042",
  editor: "Carla Soto",
  received: "2 de septiembre de 2026",
  published: "22 de noviembre de 2026",
  abstract: { Métodos: "Medimos.", Resultados: "Funciona." },
  keywords: ["a", "b"],
};

describe("open_access options", () => {
  it("validates authors, the structured abstract and the record", () => {
    const o = options(RECORD);
    expect(o).toMatchObject({
      margin: "20mm",
      numberSections: true,
      license: "CC BY 4.0",
      volume: "4",
      articleNumber: "e0042",
      abstract: { Métodos: "Medimos.", Resultados: "Funciona." },
    });
    expect(o.authors![2]).toEqual({ name: "Marta Ruiz", affiliations: [2] });
    expect(options({ authors: ["Ana Pérez"] }).authors).toEqual([{ name: "Ana Pérez" }]);
    expect(() => options({ authors: [{ name: "A", orcid: "123" }] })).toThrow("orcid");
    expect(() => options({ authors: [{ name: "A", affiliations: ["x"] }] })).toThrow(
      "affiliations",
    );
    expect(() => options({ authors: "Ana" })).toThrow("list of authors");
  });
});

describe("authors and citation", () => {
  it("abbreviates two-word names in Vancouver style and keeps longer ones", () => {
    expect(vancouverName("Ana Pérez")).toBe("Pérez A");
    expect(vancouverName("Jean-Luc Picard")).toBe("Picard JL");
    expect(vancouverName("Ana María Pérez García")).toBe("Ana María Pérez García");
    expect(yearOf("22 de noviembre de 2026")).toBe("2026");
  });

  it("writes the citation, up to six authors then et al.", () => {
    expect(
      vancouverCitation({
        names: ["Ana Pérez", "Luis Gómez"],
        title: "Título.",
        journal: "Ciencia Abierta",
        year: "2026",
        volume: "4",
        articleNumber: "e0042",
      }),
    ).toBe("Pérez A, Gómez L. Título. Ciencia Abierta. 2026;4:e0042.");
    const seven = ["A Uno", "B Dos", "C Tres", "D Cuatro", "E Cinco", "F Seis", "G Siete"];
    expect(vancouverCitation({ names: seven, title: "T" })).toBe(
      "Uno A, Dos B, Tres C, Cuatro D, Cinco E, Seis F, et al. T.",
    );
    expect(citation(options({ ...RECORD, citation: "Propia." }), "T")).toBe("Propia.");
  });

  it("shortens the authors of the running head", () => {
    expect(shortAuthors(["Ana Pérez"], "y")).toBe("Pérez");
    expect(shortAuthors(["Ana Pérez", "Luis Gómez"], "y")).toBe("Pérez y Gómez");
    expect(shortAuthors(["A Uno", "B Dos", "C Tres"], "y")).toBe("Uno et al.");
    expect(authorNames(options({ author: "Ana Pérez^1^ y Luis Gómez^2^" }))).toEqual([
      "Ana Pérez",
      "Luis Gómez",
    ]);
  });
});

describe("openAccessFront", () => {
  const html = openAccessFront(options(RECORD), "Cinética");

  it("prints the band, the record's sidebar and the title side", () => {
    expect(html).toContain('<span class="oa-journal">Ciencia Abierta</span>');
    expect(html).toContain("Acceso abierto</p>");
    expect(html).toContain("Pérez A, Gómez L, Ruiz M. Cinética. Ciencia Abierta. 2026;4:e0042.");
    expect(html).toContain('<span class="oa-label">Editor</span>Carla Soto');
    expect(html).toContain('<span class="oa-label">Recibido</span>2 de septiembre de 2026<br>');
    expect(html).not.toContain("Aceptado");
    expect(html).toContain(
      "© 2026 Pérez et al. Artículo de acceso abierto bajo la licencia CC BY 4.0",
    );
    expect(html).toContain('<span class="oa-label">Correspondencia</span>ana@ejemplo.org');
    expect(html).toContain(
      'Ana Pérez<sup>1,*</sup> <a class="orcid" href="https://orcid.org/0000-0000-0000-0001">ORCID</a>',
    );
    expect(html).toContain("<li><sup>*</sup>Autor para correspondencia.</li>");
    expect(html).toContain("<p><strong>Métodos:</strong> Medimos.</p>");
    expect(html).toContain("<strong>Palabras clave:</strong> a; b</p>");
  });

  it("leaves out what is not given, in the document's language", () => {
    const bare = openAccessFront(options({ lang: "en", author: "Ana Pérez", license: "" }), "T");
    expect(bare).not.toContain("oa-band");
    expect(bare).not.toContain("oa-badge");
    expect(bare).toContain('<span class="oa-label">Citation</span>Pérez A. T.');
  });
});

describe("openAccessPage", () => {
  it("sets the running head from page 2 and the record and page count in the footer", () => {
    const o = options({ ...RECORD, "short-title": "Cinética", accent: "#b0562b" });
    const css = openAccessPage({ options: o, margin: resolveMargins(o), title: "Título largo" });
    expect(css).toContain(":root { --oa-accent: #b0562b; }");
    expect(css).toContain('@top-left { content: "Ciencia Abierta"; }');
    expect(css).toContain('@top-right { content: "Pérez et al. · Cinética"; }');
    expect(css).toContain(
      '@bottom-left { content: "Ciencia Abierta 2026; 4: e0042 · doi.org/10.0000/ejemplo.0042"; }',
    );
    expect(css).toContain('@bottom-right { content: counter(page) " de " counter(pages); }');
    expect(css).toMatch(/@page :first \{\n {2}@top-left \{ content: none; \}/);
  });
});

describe("authors in every theme", () => {
  it("shows structured authors in the standard title block", () => {
    const html = buildHtmlDocument({
      title: "T",
      body: "",
      showTitle: true,
      authors: [{ name: "Ana Pérez", affiliations: [1], corresponding: true }],
      affiliations: ["Uno"],
      abstract: { Métodos: "M." },
    });
    expect(html).toContain('<span class="doc-author">Ana Pérez<sup>1,*</sup></span>');
    expect(html).toContain(
      '<li class="doc-corresponding"><sup>*</sup>Autor para correspondencia.</li>',
    );
    expect(html).toContain("<p><strong>Métodos:</strong> M.</p>");
  });
});

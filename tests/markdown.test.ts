import path from "node:path";
import { describe, expect, it } from "vitest";
import { localImagePath } from "../src/markdown/images.js";
import { renderMarkdown } from "../src/markdown/index.js";
import { fixture } from "./helpers.js";

const fixturesDir = path.dirname(fixture("sample.md"));

describe("renderMarkdown", () => {
  it("renders GFM tables with alignment", () => {
    const { html } = renderMarkdown("| a | b |\n| :- | -: |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain('<td style="text-align:right">2</td>');
  });

  it("renders strikethrough and autolinks", () => {
    const { html } = renderMarkdown("~~no~~ https://example.com");
    expect(html).toContain("<s>no</s>");
    expect(html).toContain('<a href="https://example.com">https://example.com</a>');
  });

  it("renders task lists as disabled checkboxes", () => {
    const { html } = renderMarkdown("- [x] hecho\n- [ ] pendiente\n- normal");
    expect(html).toContain('<ul class="contains-task-list">');
    expect(html).toContain(
      '<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled checked> hecho</li>',
    );
    expect(html).toContain(
      '<input type="checkbox" class="task-list-item-checkbox" disabled> pendiente',
    );
    expect(html).toContain("<li>normal</li>");
  });

  it("does not treat brackets elsewhere as tasks", () => {
    const { html } = renderMarkdown("[ ] not a list\n\n- texto [x] medio");
    expect(html).not.toContain("checkbox");
  });

  it("adds ids to headings", () => {
    const { html } = renderMarkdown("## Introducción");
    expect(html).toMatch(/<h2 id="[^"]+">Introducción<\/h2>/);
  });

  it("extracts the first level-1 heading as title", () => {
    expect(renderMarkdown("intro\n\n# Mi `título`\n\n# Otro").title).toBe("Mi título");
    expect(renderMarkdown("## Solo h2").title).toBeUndefined();
  });

  it("embeds local images as data URIs, including paths with spaces", () => {
    const md =
      "![a](img/gradiente.png)\n\n![b](<img/logo con espacios.svg>)\n\n![c](img/logo%20con%20espacios.svg)";
    const { html, warnings } = renderMarkdown(md, { baseDir: fixturesDir });
    expect(warnings).toEqual([]);
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo');
    expect(html.match(/src="data:image\/svg\+xml;base64,/g)).toHaveLength(2);
  });

  it("warns about missing local images and leaves remote ones alone", () => {
    const md = "![x](no-existe.png) ![y](https://example.com/a.png)";
    const { html, warnings } = renderMarkdown(md, { baseDir: fixturesDir });
    expect(warnings).toEqual(["image not found: no-existe.png"]);
    expect(html).toContain('src="https://example.com/a.png"');
  });
});

describe("localImagePath", () => {
  const base = path.resolve("/docs");

  it("resolves relative paths against the base directory", () => {
    expect(localImagePath("img/a.png", base)).toBe(path.resolve(base, "img/a.png"));
    expect(localImagePath("a%20b.png?x=1#top", base)).toBe(path.resolve(base, "a b.png"));
  });

  it("ignores remote and data URLs", () => {
    expect(localImagePath("https://x.org/a.png", base)).toBeUndefined();
    expect(localImagePath("data:image/png;base64,AAAA", base)).toBeUndefined();
  });

  it("accepts Windows drive paths as local files", () => {
    expect(localImagePath("C:\\img\\a.png", base)).toBeDefined();
  });
});

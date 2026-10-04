import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONS,
  mergeOptions,
  normalizeOptions,
  OptionsError,
  parseMargin,
} from "../src/options.js";
import { contentWidthPx } from "../src/render/page.js";

describe("parseMargin", () => {
  it.each([
    ["20mm", ["20mm", "20mm", "20mm", "20mm"]],
    ["15mm 20mm", ["15mm", "20mm", "15mm", "20mm"]],
    ["1cm 2cm 3cm", ["1cm", "2cm", "3cm", "2cm"]],
    ["1in 0.5in 1in 0.75in", ["1in", "0.5in", "1in", "0.75in"]],
  ])("expands %s like CSS", (margin, [top, right, bottom, left]) => {
    expect(parseMargin(margin)).toEqual({ top, right, bottom, left });
  });

  it.each(["", "20", "20 mm", "-5mm", "1mm 2mm 3mm 4mm 5mm", "2em"])("rejects %j", (margin) => {
    expect(() => parseMargin(margin)).toThrow(OptionsError);
  });
});

describe("normalizeOptions", () => {
  const base = path.resolve("/docs");

  it("accepts camelCase and kebab-case keys, case-insensitive choices", () => {
    expect(
      normalizeOptions(
        { "page-size": "letter", pageNumbers: false, "mermaid-theme": "Dark", toc_depth: 2 },
        "test",
        base,
      ),
    ).toEqual({ pageSize: "Letter", pageNumbers: false, mermaidTheme: "dark", tocDepth: 2 });
  });

  it("ignores unknown keys and null values (front matter can hold other metadata)", () => {
    expect(normalizeOptions({ tags: ["a"], title: null, author: "Ana" }, "test", base)).toEqual({
      author: "Ana",
    });
  });

  it("formats YAML dates and resolves CSS paths against the base directory", () => {
    const options = normalizeOptions(
      { date: new Date("2026-10-04T00:00:00Z"), css: ["estilo.css", "/abs/b.css"] },
      "test",
      base,
    );
    expect(options.date).toBe("2026-10-04");
    expect(options.css).toEqual([path.resolve(base, "estilo.css"), path.resolve("/abs/b.css")]);
  });

  it.each([
    [{ pageSize: "B5" }, /test: "pageSize" must be one of: A3, A4/],
    [{ landscape: "yes" }, /"landscape" must be true or false/],
    [{ tocDepth: 9 }, /"tocDepth" must be a whole number from 1 to 6/],
    [{ margin: "2em" }, /test: "margin": invalid margin "2em"/],
    [{ css: [1] }, /"css" must be a file path or a list/],
  ])("rejects invalid values: %j", (raw, message) => {
    expect(() => normalizeOptions(raw, "test", base)).toThrow(message);
  });

  it("names keys with a custom label", () => {
    expect(() =>
      normalizeOptions({ pageSize: "B5" }, "command line", base, () => "--page-size"),
    ).toThrow("command line: --page-size must be one of");
  });
});

describe("mergeOptions", () => {
  it("applies layers in order over the defaults", () => {
    const merged = mergeOptions(
      { pageSize: "Letter", toc: true },
      { pageSize: "A5" },
      { landscape: true },
    );
    expect(merged).toEqual({ ...DEFAULT_OPTIONS, pageSize: "A5", toc: true, landscape: true });
  });

  it("accumulates stylesheets and never mutates the defaults", () => {
    const merged = mergeOptions({ css: ["/a.css"] }, { css: ["/b.css"] });
    expect(merged.css).toEqual(["/a.css", "/b.css"]);
    expect(DEFAULT_OPTIONS.css).toEqual([]);
  });
});

describe("contentWidthPx", () => {
  it("computes the text column width in CSS pixels", () => {
    expect(contentWidthPx("A4", false, { left: "20mm", right: "20mm" })).toBe(643);
    expect(contentWidthPx("Letter", true, { left: "1in", right: "1in" })).toBe(864);
  });
});

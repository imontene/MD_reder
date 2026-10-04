import { describe, expect, it } from "vitest";
import { extractFrontMatter } from "../src/frontmatter.js";
import { OptionsError } from "../src/options.js";

describe("extractFrontMatter", () => {
  it("parses YAML and keeps line numbers by leaving blank lines", () => {
    const { data, body } = extractFrontMatter("---\ntitle: Hola\ntoc: true\n---\n# Uno\n");
    expect(data).toEqual({ title: "Hola", toc: true });
    expect(body).toBe("\n\n\n\n# Uno\n");
    expect(body.split("\n").indexOf("# Uno")).toBe(4);
  });

  it("returns the source unchanged without front matter", () => {
    expect(extractFrontMatter("# T\n---\nx: 1\n---\n")).toEqual({
      data: {},
      body: "# T\n---\nx: 1\n---\n",
    });
  });

  it("handles CRLF line endings, a BOM and the YAML `...` terminator", () => {
    const { data, body } = extractFrontMatter("﻿---\r\nlang: es\r\n...\r\ntexto");
    expect(data).toEqual({ lang: "es" });
    expect(body.endsWith("texto")).toBe(true);
  });

  it("treats an empty block as no metadata", () => {
    expect(extractFrontMatter("---\n\n---\nx").data).toEqual({});
  });

  it("reports invalid YAML and non-mapping front matter", () => {
    expect(() => extractFrontMatter("---\ntitle: [a\n---\n", "doc.md")).toThrow(
      /doc\.md: invalid YAML front matter/,
    );
    expect(() => extractFrontMatter("---\n- a\n- b\n---\n", "doc.md")).toThrow(OptionsError);
  });
});

import path from "node:path";
import { describe, expect, it } from "vitest";
import { isMarkdownFile, resolveOutputPath } from "../src/paths.js";

describe("resolveOutputPath (POSIX)", () => {
  const p = path.posix;

  it("defaults to the input's directory and base name", () => {
    expect(resolveOutputPath("/docs/notas.md", "pdf", undefined, false, p)).toBe("/docs/notas.pdf");
    expect(resolveOutputPath("notas.md", "html", undefined, false, p)).toBe("notas.html");
  });

  it("uses an explicit output file as-is", () => {
    expect(resolveOutputPath("a.md", "pdf", "out/informe.pdf", false, p)).toBe("out/informe.pdf");
  });

  it("places the file inside an output directory", () => {
    expect(resolveOutputPath("/docs/a.md", "pdf", "out/", false, p)).toBe("out/a.pdf");
    expect(resolveOutputPath("/docs/a.md", "pdf", "out", true, p)).toBe("out/a.pdf");
  });
});

describe("resolveOutputPath (Windows)", () => {
  const p = path.win32;

  it("handles drive letters, backslashes and spaces", () => {
    expect(resolveOutputPath("C:\\Users\\yo\\notas de clase.md", "pdf", undefined, false, p)).toBe(
      "C:\\Users\\yo\\notas de clase.pdf",
    );
  });

  it("places the file inside an output directory", () => {
    expect(resolveOutputPath("C:\\docs\\a.md", "pdf", "D:\\pdf\\", false, p)).toBe(
      "D:\\pdf\\a.pdf",
    );
    expect(resolveOutputPath("C:\\docs\\a.md", "pdf", "D:\\pdf", true, p)).toBe("D:\\pdf\\a.pdf");
  });
});

describe("isMarkdownFile", () => {
  it.each(["a.md", "A.MD", "dir/b.markdown", "ñandú.md"])("accepts %s", (f) => {
    expect(isMarkdownFile(f)).toBe(true);
  });

  it.each(["a.txt", "a.md.bak", "md"])("rejects %s", (f) => {
    expect(isMarkdownFile(f)).toBe(false);
  });
});

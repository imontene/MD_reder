import { describe, expect, it } from "vitest";
import { isMarkdownFile } from "../src/paths.js";

describe("isMarkdownFile", () => {
  it.each(["a.md", "A.MD", "dir/b.markdown", "ñandú.md"])("accepts %s", (f) => {
    expect(isMarkdownFile(f)).toBe(true);
  });

  it.each(["a.txt", "a.md.bak", "md"])("rejects %s", (f) => {
    expect(isMarkdownFile(f)).toBe(false);
  });
});

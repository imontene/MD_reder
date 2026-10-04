import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { expandInputs, planOutputs } from "../src/inputs.js";
import { OptionsError } from "../src/options.js";
import { tempDir } from "./helpers.js";

/** A folder tree: docs/a.md, docs/sub/b.markdown, docs/notes.txt, hidden and node_modules files. */
function tree(): string {
  const root = tempDir();
  const files = [
    "docs/a.md",
    "docs/sub/b.markdown",
    "docs/notes.txt",
    "docs/.oculto/x.md",
    "docs/node_modules/pkg/readme.md",
    "otro/c.md",
  ];
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), "# x\n");
  }
  return root;
}

const rel = (root: string, files: { file: string }[]) =>
  files.map(({ file }) => path.relative(root, file).replace(/\\/g, "/"));

describe("expandInputs", () => {
  it("searches folders recursively, skipping hidden folders and node_modules", () => {
    const root = tree();
    const found = expandInputs(["docs"], root);
    expect(rel(root, found)).toEqual(["docs/a.md", "docs/sub/b.markdown"]);
    expect(found[0]!.root).toBe(path.join(root, "docs"));
  });

  it("expands glob patterns itself (also with Windows separators)", () => {
    const root = tree();
    expect(rel(root, expandInputs(["**/*.md"], root))).toEqual(["docs/a.md", "otro/c.md"]);
    expect(rel(root, expandInputs(["docs\\**\\*.markdown"], root))).toEqual([
      "docs/sub/b.markdown",
    ]);
    expect(expandInputs(["docs/**/*.md"], root)[0]!.root).toBe(path.join(root, "docs"));
  });

  it("keeps files named directly and removes duplicates", () => {
    const root = tree();
    const found = expandInputs(["docs/a.md", "docs", "otro/c.md"], root);
    expect(rel(root, found)).toEqual(["docs/a.md", "docs/sub/b.markdown", "otro/c.md"]);
    expect(found[0]!.root).toBeUndefined();
  });

  it.each([
    [["no-existe.md"], /input file not found: no-existe\.md/],
    [["docs/notes.txt"], /not a Markdown file/],
    [["*.pdf"], /no Markdown files match/],
  ])("rejects %j", (inputs, message) => {
    expect(() => expandInputs(inputs, tree())).toThrow(message);
  });

  it("rejects folders without Markdown files", () => {
    const root = tempDir();
    mkdirSync(path.join(root, "vacia"));
    expect(() => expandInputs(["vacia"], root)).toThrow(OptionsError);
  });
});

describe("planOutputs", () => {
  it("writes next to each input by default", () => {
    const root = tree();
    const jobs = planOutputs(expandInputs(["docs"], root), "pdf", undefined, root);
    expect(
      rel(
        root,
        jobs.map((j) => ({ file: j.output })),
      ),
    ).toEqual(["docs/a.pdf", "docs/sub/b.pdf"]);
  });

  it("uses an explicit file name for a single input", () => {
    const root = tree();
    const [job] = planOutputs(expandInputs(["docs/a.md"], root), "pdf", "out/informe.pdf", root);
    expect(job!.output).toBe(path.join(root, "out", "informe.pdf"));
  });

  it("keeps the folder structure inside an output folder", () => {
    const root = tree();
    const inputs = expandInputs(["docs", "otro/c.md"], root);
    const jobs = planOutputs(inputs, "html", "salida/", root);
    expect(
      rel(
        root,
        jobs.map((j) => ({ file: j.output })),
      ),
    ).toEqual(["salida/a.html", "salida/sub/b.html", "salida/c.html"]);
  });

  it("treats a new output path as a folder for several inputs", () => {
    const root = tree();
    const jobs = planOutputs(expandInputs(["docs"], root), "pdf", "nueva", root);
    expect(jobs[0]!.output).toBe(path.join(root, "nueva", "a.pdf"));
  });

  it("requires a folder for several inputs", () => {
    const root = tree();
    expect(() => planOutputs(expandInputs(["docs"], root), "pdf", "uno.pdf", root)).toThrow(
      /--output must be a folder/,
    );
  });

  it("refuses two inputs that would write the same file", () => {
    const root = tree();
    writeFileSync(path.join(root, "otro", "a.md"), "# y\n");
    const inputs = expandInputs(["docs/a.md", "otro/a.md"], root);
    expect(() => planOutputs(inputs, "pdf", "out/", root)).toThrow(/would both be written/);
  });
});

import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/markdown/index.js";
import { buildHtmlDocument } from "../src/render/template.js";

const katexCount = (html: string) => (html.match(/class="katex"/g) ?? []).length;
const displayCount = (html: string) => (html.match(/class="katex-display"/g) ?? []).length;

describe("math", () => {
  it("renders inline math", () => {
    const { html, hasMath, diagnostics } = renderMarkdown("Euler: $e^{i\\pi} + 1 = 0$.");
    expect(hasMath).toBe(true);
    expect(diagnostics).toEqual([]);
    expect(katexCount(html)).toBe(1);
    expect(displayCount(html)).toBe(0);
    expect(html).toContain('Euler: <span class="katex">');
  });

  it("renders multi-line and single-line $$ blocks", () => {
    const { html } = renderMarkdown("$$\n\\int_0^1 x\\,dx\n$$\n\n$$ a^2 + b^2 = c^2 $$");
    expect(displayCount(html)).toBe(2);
    expect(html.match(/<div class="math-display">/g)).toHaveLength(2);
    expect(html).not.toContain("$$");
  });

  it("renders $$ inside a paragraph as display math", () => {
    const { html } = renderMarkdown("Suma: $$\\sum_k k$$ fin");
    expect(displayCount(html)).toBe(1);
    expect(html).toContain("Suma: ");
  });

  it("renders ```math fences", () => {
    const { html } = renderMarkdown("```math\nx = \\frac{1}{2}\n```");
    expect(displayCount(html)).toBe(1);
    expect(html).not.toContain("<code");
  });

  it("supports aligned environments and matrices", () => {
    const src =
      "$$\n\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}\n$$\n\n$\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$";
    const { diagnostics, html } = renderMarkdown(src);
    expect(diagnostics).toEqual([]);
    expect(katexCount(html)).toBe(2);
  });

  it("keeps macros defined earlier in the document", () => {
    const { html, diagnostics } = renderMarkdown("$\\def\\R{\\mathbb{R}}$ y luego $x \\in \\R$");
    expect(diagnostics).toEqual([]);
    expect(html).toContain("mathbb");
  });

  it.each([
    ["prices", "Cuesta $5 y $10."],
    ["escaped dollars", "Esto \\$no\\$ es math."],
    ["space after opening", "a $ b$ c"],
    ["space before closing", "a $b $ c"],
    ["code spans", "`echo $HOME $PATH`"],
    ["code blocks", "```sh\necho $A $B\n```"],
    ["lone dollar", "solo $ uno"],
  ])("does not treat %s as math", (_name, src) => {
    const { html, hasMath } = renderMarkdown(src);
    expect(hasMath).toBe(false);
    expect(katexCount(html)).toBe(0);
  });

  it("reports LaTeX errors with their line and shows the source", () => {
    const { html, diagnostics } = renderMarkdown("# T\n\nok $x$\n\nmal $\\frac{1}{$ aquí");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ severity: "error", line: 5 });
    expect(diagnostics[0]!.message).toMatch(/^LaTeX: /);
    expect(html).toContain('<span class="math-error"');
    expect(html).toContain("\\frac{1}{</span>");
  });

  it("reports errors in display blocks at the block's first line", () => {
    const { diagnostics } = renderMarkdown("intro\n\n$$\n\\begin{matrix} a\n$$");
    expect(diagnostics).toMatchObject([{ severity: "error", line: 3 }]);
  });

  it("does not render raw HTML inside formulas", () => {
    const { html } = renderMarkdown("$\\text{<script>x</script>}$");
    expect(html).not.toContain("<script>");
  });
});

describe("KaTeX stylesheet", () => {
  it("is embedded only when the document has math", () => {
    const withMath = buildHtmlDocument({ title: "t", body: "", math: true });
    const without = buildHtmlDocument({ title: "t", body: "" });
    expect(withMath).toContain("font-family:KaTeX_Main");
    expect(without).not.toContain("font-family:KaTeX");
    const external = [...withMath.matchAll(/url\(["']?([^)"']+)/g)]
      .map((m) => m[1]!)
      .filter((url) => !url.startsWith("data:"));
    expect(external).toEqual([]);
  });
});

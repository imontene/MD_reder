import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/markdown/index.js";
import { mermaidPlaceholder } from "../src/markdown/mermaid.js";
import { fillMermaid } from "../src/render/mermaid.js";

const doc =
  "# D\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n```js\nx\n```\n\n```Mermaid\npie\n```\n";

describe("mermaid fences", () => {
  it("collects diagram sources with their line numbers", () => {
    const { mermaid } = renderMarkdown(doc);
    expect(mermaid).toEqual([
      { source: "flowchart LR\n  A --> B\n", line: 3 },
      { source: "pie\n", line: 12 },
    ]);
  });

  it("leaves a placeholder per diagram and renders other fences normally", () => {
    const { html, nonce } = renderMarkdown(doc);
    expect(html).toContain(
      `<figure class="mermaid-diagram">${mermaidPlaceholder(nonce, 0)}</figure>`,
    );
    expect(html).toContain(mermaidPlaceholder(nonce, 1));
    expect(html).toContain('<code class="language-js">');
  });

  it("uses a fresh nonce per render so placeholders cannot be forged from Markdown", () => {
    expect(renderMarkdown(doc).nonce).not.toBe(renderMarkdown(doc).nonce);
  });
});

describe("fillMermaid", () => {
  it("replaces placeholders with SVGs and failures with an error box", () => {
    const { html, nonce, mermaid } = renderMarkdown(doc);
    const filled = fillMermaid(html, nonce, mermaid, [
      { svg: '<svg id="mermaid-1">$&</svg>' },
      { error: "Parse error on line 2:\npie\n^\nExpecting 'EOF', got 'x'" },
    ]);

    expect(filled.html).toContain('<svg id="mermaid-1">$&</svg>');
    expect(filled.html).toContain('<pre class="mermaid-error"><strong>Mermaid error</strong>');
    expect(filled.html).not.toContain("<!--mermaid:");
    expect(filled.diagnostics).toEqual([
      { severity: "error", message: "Mermaid: Expecting 'EOF', got 'x'", line: 12 },
    ]);
  });

  it("escapes the diagram source in error boxes", () => {
    const { html, nonce, mermaid } = renderMarkdown(
      "```mermaid\n<img src=x onerror=alert(1)>\n```",
    );
    const filled = fillMermaid(html, nonce, mermaid, [{ error: "bad" }]);
    expect(filled.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(filled.html).not.toContain("<img");
  });
});

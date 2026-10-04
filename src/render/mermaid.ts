import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Diagnostic } from "../diagnostics.js";
import type { MermaidBlock } from "../markdown/env.js";
import type { MermaidTheme } from "../options.js";
import { mermaidPlaceholder } from "../markdown/mermaid.js";
import type { BrowserSession } from "./browser.js";
import { fontFaceCss } from "./fonts.js";
import { escapeHtml } from "../html.js";

const require = createRequire(import.meta.url);

export { MERMAID_THEMES, type MermaidTheme } from "../options.js";

/** Width of the text column on A4 with 20 mm margins. */
const DEFAULT_WIDTH_PX = 642;

type DiagramResult = { svg: string } | { error: string };

let mermaidJs: string | undefined;

/**
 * Render Mermaid diagrams to SVG in a blank page that holds no user content: only the diagram
 * sources are passed in, as data. Mermaid runs with `securityLevel: "strict"`.
 */
export async function renderMermaid(
  session: BrowserSession,
  blocks: MermaidBlock[],
  theme: MermaidTheme = "neutral",
  /** Width of the text column, so diagrams are laid out at their printed size. */
  widthPx = DEFAULT_WIDTH_PX,
): Promise<DiagramResult[]> {
  mermaidJs ??= readFileSync(require.resolve("mermaid/dist/mermaid.min.js"), "utf8");

  const page = await session.newPage();
  try {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss()}
body { margin: 0; width: ${widthPx}px; font-family: "Inter", sans-serif; }</style>
</head><body></body></html>`,
    );
    await page.evaluate(mermaidJs);
    return await page.evaluate(
      async (sources: string[], theme: string) => {
        // Runs in the browser. The project is compiled without DOM types, hence PageGlobals.
        const { document, mermaid } = globalThis as unknown as PageGlobals;
        // Load the font weights Mermaid uses before it measures any text.
        await Promise.all(["400", "600", "700"].map((w) => document.fonts.load(`${w} 16px Inter`)));

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme,
          fontFamily: "Inter, sans-serif",
          themeVariables: { fontFamily: "Inter, sans-serif" },
          htmlLabels: true,
        });

        const results: DiagramResult[] = [];
        for (const [i, source] of sources.entries()) {
          try {
            const { svg } = await mermaid.render(`mermaid-${i + 1}`, source);
            results.push({ svg });
          } catch (error) {
            results.push({ error: String((error as Error)?.message ?? error) });
          }
        }
        return results;
      },
      blocks.map((b) => b.source),
      theme,
    );
  } finally {
    await page.close();
  }
}

interface PageGlobals {
  document: { fonts: { load(font: string): Promise<unknown> } };
  mermaid: {
    initialize(config: Record<string, unknown>): void;
    render(id: string, text: string): Promise<{ svg: string }>;
  };
}

/**
 * One-line summary of a Mermaid error. Parse errors span several lines ("Parse error on line N:",
 * a code excerpt, a caret, "Expecting ..."); the line number counts from the diagram, not the
 * file, so the "Expecting ..." line is the useful part.
 */
function summarize(message: string): string {
  const lines = message
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const expecting = lines.find((l) => l.startsWith("Expecting"));
  return expecting ?? lines[0] ?? "unknown error";
}

/**
 * Replace the Mermaid placeholders in `html` with rendered SVGs, or with a visible error box.
 * Returns the new HTML and one error diagnostic per failed diagram.
 */
export function fillMermaid(
  html: string,
  nonce: string,
  blocks: MermaidBlock[],
  results: DiagramResult[],
): { html: string; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  blocks.forEach((block, i) => {
    const result = results[i] ?? { error: "diagram was not rendered" };
    let replacement: string;
    if ("svg" in result) {
      replacement = result.svg;
    } else {
      const message = result.error.trim();
      diagnostics.push({
        severity: "error",
        message: `Mermaid: ${summarize(message)}`,
        line: block.line,
      });
      replacement = `<pre class="mermaid-error"><strong>Mermaid error</strong>\n${escapeHtml(message)}\n\n${escapeHtml(block.source)}</pre>`;
    }
    html = html.replace(mermaidPlaceholder(nonce, i), () => replacement);
  });
  return { html, diagnostics };
}

/**
 * Compare Mermaid diagrams printed as written and with autofit, on Letter with 10 mm margins.
 *
 *   npm run bench:mermaid [-- file.md]     (default: tests/fixtures/mermaid-autofit.md)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BrowserPool } from "../../src/convert.js";
import { renderMarkdown } from "../../src/markdown/index.js";
import { DEFAULT_OPTIONS, resolveMargins } from "../../src/options.js";
import { renderMermaid, type MermaidRenderOptions } from "../../src/render/mermaid.js";
import { SMALL_SCALE } from "../../src/render/mermaid-fit.js";
import { contentHeightPx, contentWidthPx, lengthToPx } from "../../src/render/page.js";

const file =
  process.argv[2] ?? fileURLToPath(new URL("../fixtures/mermaid-autofit.md", import.meta.url));
const { mermaid: blocks } = renderMarkdown(readFileSync(file, "utf8"));
const margin = resolveMargins(DEFAULT_OPTIONS);
const options: MermaidRenderOptions = {
  widthPx: contentWidthPx("Letter", false, margin),
  pageHeightPx: contentHeightPx("Letter", false, margin) - lengthToPx("6mm"),
};

const pool = new BrowserPool();
try {
  const session = await pool.get();
  let started = Date.now();
  const before = await renderMermaid(session, blocks, { ...options, autofit: false });
  const beforeMs = Date.now() - started;
  started = Date.now();
  const after = await renderMermaid(session, blocks, options);
  const afterMs = Date.now() - started;
  const never = await renderMermaid(session, blocks, { ...options, flip: "never" });

  const scale = (r: (typeof before)[number] | undefined) =>
    r && "svg" in r && r.scale !== undefined ? r.scale : NaN;
  const height = (r: (typeof before)[number] | undefined) => {
    const m = r && "svg" in r ? /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(r.svg) : null;
    return m ? Math.round(Number(m[2]) * scale(r)) : NaN;
  };

  console.log("line  scale before → after   height before → after   choice");
  blocks.forEach((block, i) => {
    const b = before[i];
    const a = after[i];
    const layout = a && "layout" in a ? a.layout : undefined;
    const choice = !layout
      ? "not applicable"
      : [layout.wrap ? `wrap ${layout.wrap}` : "", layout.turned ? `turned ${layout.turned}` : ""]
          .filter(Boolean)
          .join(", ") || "as written";
    console.log(
      `${String(block.line).padStart(4)}  ${scale(b).toFixed(2)} → ${scale(a).toFixed(2)}` +
        `           ${String(height(b)).padStart(5)} → ${String(height(a)).padEnd(5)} px` +
        `       ${choice}${layout ? ` (${layout.tried} renders)` : ""}`,
    );
  });

  const summary = (name: string, results: typeof before) => {
    const scales = results.map(scale).filter((s) => !Number.isNaN(s));
    const mean = scales.reduce((a, b) => a + b, 0) / scales.length;
    const small = scales.filter((s) => s < 0.6).length;
    const unreadable = scales.filter((s) => s < SMALL_SCALE).length;
    const total = results.map(height).reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
    console.log(
      `${name.padEnd(16)} mean scale ${mean.toFixed(2)}, below 0.6: ${small}, ` +
        `below ${SMALL_SCALE}: ${unreadable}, total height ${total} px`,
    );
  };
  console.log();
  summary("as written", before);
  summary("autofit, never", never);
  summary("autofit, auto", after);
  console.log(`\ntime: ${beforeMs} ms as written, ${afterMs} ms with autofit`);
} finally {
  await pool.close();
}

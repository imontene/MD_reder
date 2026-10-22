import { MERMAID_JS, readTextAsset } from "../assets.js";
import type { Diagnostic } from "../diagnostics.js";
import type { MermaidBlock } from "../markdown/env.js";
import type { MermaidFlip, MermaidTheme, TextFont } from "../options.js";
import { mermaidPlaceholder } from "../markdown/mermaid.js";
import type { BrowserSession } from "./browser.js";
import { FONT_FAMILIES, fontFaceCss, fontStack } from "./fonts.js";
import { escapeHtml } from "../html.js";
import {
  authorConfigured,
  candidate,
  chooseCandidate,
  flipWorthTrying,
  flippedDirection,
  flowchartHeader,
  withDirection,
  WRAPPING_WIDTHS,
  wrapsExhausted,
  type Candidate,
  type Fit,
} from "./mermaid-fit.js";

export { MERMAID_THEMES, type MermaidTheme } from "../options.js";

/** Width of the text column on A4 with 20 mm margins. */
const DEFAULT_WIDTH_PX = 642;

/** 10.5pt, the built-in themes' text size (Mermaid's own default is 16px). */
const DEFAULT_FONT_PX = 14;

/** How autofit laid out a flowchart (see render/mermaid-fit.ts). */
export interface DiagramLayout {
  /** Label wrapping width in px; undefined is Mermaid's default. */
  wrap: number | undefined;
  /** Main direction turned to the other axis, e.g. "LR→TB"; undefined when kept. */
  turned?: string;
  /** Printed scale and height (CSS px) as written and as chosen. */
  baseScale: number;
  scale: number;
  baseHeight: number;
  height: number;
  /** Layouts rendered to choose this one. */
  tried: number;
}

export type DiagramResult =
  | {
      svg: string;
      /** Printed scale (1 = natural size), when the SVG could be measured. */
      scale?: number;
      /** Set for flowcharts considered by autofit. */
      layout?: DiagramLayout;
    }
  | { error: string };

export interface MermaidRenderOptions {
  theme?: MermaidTheme;
  /** Width of the text column, so diagrams are laid out at their printed size. */
  widthPx?: number;
  /** Text size of the document in CSS pixels, so diagram labels match the body text. */
  fontPx?: number;
  /** Tallest a diagram may print (the page's text height), in CSS px; Infinity for HTML. */
  pageHeightPx?: number;
  /** Search label wrapping widths (and, with `flip`, the other axis) for each flowchart. */
  autofit?: boolean;
  flip?: MermaidFlip;
  /** Text font of the document, used for diagram labels too. */
  font?: TextFont;
  /** Extra Mermaid theme variables (the Anti-Gravity colours for the "base" theme). */
  themeVariables?: Record<string, string | boolean>;
}

/**
 * Room kept for a heading printed together with the diagram below it (see keep-with-heading in
 * theme.css, where the same allowance is subtracted), in multiples of the text size.
 */
export const HEADING_ALLOWANCE_EM = 5;

let mermaidJs: string | undefined;

function mermaidConfig(
  theme: MermaidTheme,
  font: TextFont,
  fontPx: number,
  wrap: number | undefined,
  themeVariables: Record<string, string | boolean> = {},
) {
  const fontFamily = fontStack(font);
  return {
    startOnLoad: false,
    securityLevel: "strict",
    theme,
    fontFamily,
    // Sequence diagrams take their text sizes from here, the others from themeVariables.
    fontSize: fontPx,
    themeVariables: { ...themeVariables, fontFamily, fontSize: `${fontPx}px` },
    htmlLabels: true,
    // Actors only at the top of sequence diagrams: repeating them below costs height.
    sequence: { mirrorActors: false },
    ...(wrap === undefined ? {} : { flowchart: { wrappingWidth: wrap } }),
  };
}

/**
 * Render Mermaid diagrams to SVG in a blank page that holds no user content: only the diagram
 * sources are passed in, as data. Mermaid runs with `securityLevel: "strict"`. With `autofit`,
 * flowcharts are rendered in several layouts and the one whose text prints largest is kept.
 */
export async function renderMermaid(
  session: BrowserSession,
  blocks: MermaidBlock[],
  options: MermaidRenderOptions = {},
): Promise<DiagramResult[]> {
  const {
    theme = "neutral",
    widthPx = DEFAULT_WIDTH_PX,
    fontPx = DEFAULT_FONT_PX,
    pageHeightPx = Infinity,
    autofit = true,
    flip = "auto",
    font = "manrope",
  } = options;
  const family = FONT_FAMILIES[font];
  mermaidJs ??= readTextAsset(MERMAID_JS);

  const page = await session.newPage();
  try {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss(font)}
body { margin: 0; width: ${widthPx}px; font-family: ${fontStack(font)}; }</style>
</head><body></body></html>`,
    );
    await page.evaluate(mermaidJs);
    await page.evaluate(async (family: string) => {
      // Runs in the browser. The project is compiled without DOM types, hence PageGlobals.
      const { document } = globalThis as unknown as PageGlobals;
      // Load the font weights Mermaid uses before it measures any text.
      await Promise.all(
        ["400", "600", "700"].map((w) => document.fonts.load(`${w} 16px "${family}"`)),
      );
    }, family);

    const render = (source: string, id: string, wrap: number | undefined) =>
      page.evaluate(
        async (source: string, id: string, config: Record<string, unknown>) => {
          const { mermaid } = globalThis as unknown as PageGlobals;
          // Each render sets the whole configuration, so one layout never leaks into the next.
          mermaid.initialize(config);
          try {
            return { svg: (await mermaid.render(id, source)).svg };
          } catch (error) {
            return { error: String((error as Error)?.message ?? error) };
          }
        },
        source,
        id,
        mermaidConfig(theme, font, fontPx, wrap, options.themeVariables),
      ) as Promise<{ svg: string } | { error: string }>;

    const results: DiagramResult[] = [];
    for (const [i, block] of blocks.entries()) {
      const id = `mermaid-${i + 1}`;
      const fit: Fit = {
        width: widthPx,
        height: block.afterHeading ? pageHeightPx - HEADING_ALLOWANCE_EM * fontPx : pageHeightPx,
      };
      const written = await render(block.source, id, undefined);
      if ("error" in written) {
        results.push(written);
        continue;
      }
      const base = candidate(written.svg, undefined, false, fit);
      const header = flowchartHeader(block.source);
      if (!autofit || !base || !header || authorConfigured(block.source)) {
        results.push({ svg: written.svg, scale: base?.scale });
        continue;
      }

      let tried = 1;
      const candidates: Candidate[] = [base];
      const tryWraps = async (source: string, flipped: boolean) => {
        let previous = flipped ? undefined : base;
        for (const wrap of WRAPPING_WIDTHS) {
          if (!flipped && wrap === undefined) continue; // that is `base`
          const rendered = await render(source, `${id}-${tried}`, wrap);
          tried++;
          if ("error" in rendered) continue;
          const next = candidate(rendered.svg, wrap, flipped, fit);
          if (!next) continue;
          candidates.push(next);
          if (wrapsExhausted(next, previous, fit)) break;
          previous = next;
        }
      };

      await tryWraps(block.source, false);
      let chosen = chooseCandidate(candidates, base);
      const turnedTo = flippedDirection(header.direction);
      if (flip === "auto" && flipWorthTrying(chosen)) {
        await tryWraps(withDirection(block.source, header, turnedTo), true);
        chosen = chooseCandidate(candidates, base);
      }
      // Candidate ids ("mermaid-2-3") stay unique in the document, and its styles are scoped
      // to that id, so the chosen SVG is used as rendered.
      results.push({
        svg: chosen.svg,
        scale: chosen.scale,
        layout: {
          wrap: chosen.wrap,
          turned: chosen.flipped ? `${header.direction}→${turnedTo}` : undefined,
          baseScale: base.scale,
          scale: chosen.scale,
          baseHeight: Math.round(base.height * base.scale),
          height: Math.round(chosen.height * chosen.scale),
          tried,
        },
      });
    }
    return results;
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

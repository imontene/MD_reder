import { launch, type Browser, type Page, type PDFOptions } from "puppeteer-core";
import { RenderError } from "../errors.js";

const DEFAULT_TIMEOUT = 60_000;

function launchArgs(): string[] {
  const args = ["--disable-gpu", "--font-render-hinting=none"];
  // Chromium refuses to start its sandbox as root (common in containers and CI).
  const isRoot = process.platform !== "win32" && process.getuid?.() === 0;
  if (isRoot || process.env.MDRENDER_NO_SANDBOX === "1") {
    args.push("--no-sandbox");
  }
  return args;
}

/**
 * Whether a failed launch should be retried without Chrome's sandbox. Ubuntu 23.10+ blocks the
 * sandbox (AppArmor user-namespace restrictions) for browsers not installed from a package,
 * such as the one `mdrender setup` downloads. The pages mdrender opens run no document
 * JavaScript and have no network access, so running unsandboxed there is an acceptable
 * fallback.
 */
export function shouldRetryWithoutSandbox(
  error: unknown,
  args: string[],
  platform: NodeJS.Platform = process.platform,
): boolean {
  return (
    platform === "linux" &&
    !args.includes("--no-sandbox") &&
    /no usable sandbox/i.test(String((error as Error)?.message ?? error))
  );
}

export interface PrintOptions {
  format?: PDFOptions["format"];
  landscape?: boolean;
  margin?: { top: string; right: string; bottom: string; left: string };
  /** Chrome header/footer templates; both omitted means no header or footer. */
  headerTemplate?: string;
  footerTemplate?: string;
  /** Let the page load http(s) resources (remote images, stylesheets). Off by default. */
  allowRemote?: boolean;
  /**
   * Width of the page's text area in CSS px. When set, the page is laid out at that width with
   * print styles before printing, to fit each figure's image above its caption (see
   * FIGURE_FIT) and, with `cleanSoftHyphens`, to drop the soft hyphens that do not fall
   * at the end of a line (see SOFT_HYPHEN_CLEANUP).
   */
  textWidthPx?: number;
  cleanSoftHyphens?: boolean;
}

/**
 * Fit each figure on its page. Images are scaled down to the page's text height (theme.css); a
 * figure's caption must fit on the same page, or it lands alone on the next one. Each captioned
 * figure gets `--caption-room`: the caption's height with its top margin, plus the figure's
 * bottom margin (kept at the foot of a page when the figure spans the columns). Then an image
 * stretched to its column's width (magazine themes) but cut down in height gets the width of
 * its proportions back. Runs as our own code in the print page.
 */
export const FIGURE_FIT = `(width) => {
  const root = document.documentElement;
  root.style.width = width + "px";
  try {
    let fitted = 0;
    for (const figure of document.querySelectorAll("figure")) {
      const caption = figure.querySelector(":scope > figcaption");
      if (!caption || !figure.querySelector(":scope > img, :scope > a > img")) continue;
      const px = (element, property) => parseFloat(getComputedStyle(element)[property]) || 0;
      const room =
        caption.getBoundingClientRect().height + px(caption, "marginTop") + px(figure, "marginBottom");
      figure.style.setProperty("--caption-room", Math.ceil(room) + "px");
      fitted++;
    }
    for (const image of document.querySelectorAll("figure img")) {
      const ratio = image.naturalWidth / image.naturalHeight;
      const box = image.getBoundingClientRect();
      if (!(ratio > 0) || box.height === 0 || box.width <= box.height * ratio * 1.01) continue;
      image.style.width = box.height * ratio + "px";
      image.style.marginLeft = image.style.marginRight = "auto";
    }
    return fitted;
  } finally {
    root.style.width = "";
  }
}`;

/**
 * Keep only the soft hyphens (U+00AD) where a line actually breaks. Chrome copies every soft
 * hyphen into the PDF's text, which splits words for copy, search and text extraction; only the
 * ones that print as "-" belong there. The page is laid out at the printed column width with
 * print styles; Chrome breaks lines greedily, so removing break points it did not use leaves
 * every line as it was. Runs as our own code in the print page, whose scripts are disabled.
 */
export const SOFT_HYPHEN_CLEANUP = `(width) => {
  const root = document.documentElement;
  root.style.width = width + "px";
  try {
    const range = document.createRange();
    // The character right after a used soft hyphen also reports the "-" drawn at the end of the
    // previous line: take its last rectangle, and the first one for the character before.
    const top = (node, i, last) => {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      const rect = last ? rects[rects.length - 1] : rects[0];
      return rect ? rect.top : NaN;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.data.includes("\u00AD")) nodes.push(node);
    }
    let kept = 0;
    for (const node of nodes) {
      const text = node.data;
      let result = "";
      for (let i = 0; i < text.length; i++) {
        if (text[i] !== "\u00AD") {
          result += text[i];
        } else if (i > 0 && i < text.length - 1 && top(node, i + 1, true) > top(node, i - 1) + 1) {
          result += text[i];
          kept++;
        }
      }
      node.data = result;
    }
    return kept;
  } finally {
    root.style.width = "";
  }
}`;

/**
 * Only allow requests the document needs: inline data, plus http(s) when `allowRemote`.
 * file: URLs are always refused, so HTML in a Markdown file cannot pull local files into
 * the PDF (local images are embedded beforehand). Returns the URLs that were blocked.
 */
async function restrictNetwork(page: Page, allowRemote: boolean): Promise<string[]> {
  const blocked: string[] = [];
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.isInterceptResolutionHandled()) return;
    const url = request.url();
    const scheme = url.slice(0, url.indexOf(":")).toLowerCase();
    if (scheme === "data" || scheme === "about" || scheme === "blob") {
      void request.continue();
    } else if (allowRemote && (scheme === "http" || scheme === "https")) {
      void request.continue();
    } else {
      blocked.push(url);
      void request.abort("blockedbyclient");
    }
  });
  return blocked;
}

/** One headless browser shared by every step of a conversion (Mermaid, then PDF). */
export class BrowserSession {
  private constructor(
    private readonly browser: Browser,
    readonly timeout: number,
  ) {}

  static async open(
    executablePath: string,
    timeout = DEFAULT_TIMEOUT,
    /** Told when the browser had to start without its sandbox. */
    onUnsandboxed?: () => void,
  ): Promise<BrowserSession> {
    const args = launchArgs();
    const start = (launchWith: string[]) =>
      launch({ executablePath, headless: true, args: launchWith, timeout });
    try {
      let browser: Browser;
      try {
        browser = await start(args);
      } catch (error) {
        if (!shouldRetryWithoutSandbox(error, args)) throw error;
        browser = await start([...args, "--no-sandbox"]);
        onUnsandboxed?.();
      }
      return new BrowserSession(browser, timeout);
    } catch (error) {
      throw new RenderError(
        `could not start the browser at ${executablePath}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * A page for trusted code only (our own scripts), with no network access; see `printPdf` for
   * user content.
   */
  async newPage(): Promise<Page> {
    const page = await this.browser.newPage();
    page.setDefaultTimeout(this.timeout);
    await restrictNetwork(page, false);
    return page;
  }

  /**
   * Print a complete HTML document to PDF. Page scripts are disabled: the document is fully
   * rendered by then (math by KaTeX, diagrams by Mermaid), and any <script> in the Markdown
   * must not run.
   */
  /** Returns the PDF bytes (the caller writes them) and the URLs that were blocked. */
  async printPdf(
    html: string,
    options: PrintOptions,
  ): Promise<{ pdf: Uint8Array; blocked: string[] }> {
    const margin = options.margin ?? { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" };
    const headerFooter =
      options.headerTemplate !== undefined || options.footerTemplate !== undefined;
    const page = await this.browser.newPage();
    page.setDefaultTimeout(this.timeout);
    const blocked = await restrictNetwork(page, options.allowRemote ?? false);
    try {
      await page.setJavaScriptEnabled(false);
      await page.setContent(html, { waitUntil: "load" });
      // Make sure every embedded font has loaded before printing.
      await page.evaluate("document.fonts.ready.then(() => undefined)");
      if (options.textWidthPx !== undefined) {
        const width = options.textWidthPx;
        await page.emulateMediaType("print");
        await page.setViewport({ width: Math.ceil(width), height: 1000 });
        await page.evaluate(`(${FIGURE_FIT})(${width})`);
        if (options.cleanSoftHyphens) await page.evaluate(`(${SOFT_HYPHEN_CLEANUP})(${width})`);
      }
      const pdf = await page.pdf({
        format: options.format ?? "A4",
        landscape: options.landscape ?? false,
        margin,
        printBackground: true,
        displayHeaderFooter: headerFooter,
        headerTemplate: options.headerTemplate ?? "<span></span>",
        footerTemplate: options.footerTemplate ?? "<span></span>",
        // PDF bookmarks from the headings, and a tagged (accessible) PDF.
        outline: true,
        tagged: true,
        timeout: this.timeout,
      });
      return { pdf, blocked: [...new Set(blocked)] };
    } catch (error) {
      throw new RenderError(`failed to render PDF: ${(error as Error).message}`);
    } finally {
      await page.close();
    }
  }

  /** Browser name and version, e.g. "HeadlessChrome/141.0.7390.37". */
  version(): Promise<string> {
    return this.browser.version();
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}

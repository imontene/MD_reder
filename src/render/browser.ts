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

export interface PrintOptions {
  output: string;
  format?: PDFOptions["format"];
  landscape?: boolean;
  margin?: { top: string; right: string; bottom: string; left: string };
  /** Chrome header/footer templates; both omitted means no header or footer. */
  headerTemplate?: string;
  footerTemplate?: string;
  /** Let the page load http(s) resources (remote images, stylesheets). Off by default. */
  allowRemote?: boolean;
}

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

  static async open(executablePath: string, timeout = DEFAULT_TIMEOUT): Promise<BrowserSession> {
    try {
      const browser = await launch({ executablePath, headless: true, args: launchArgs(), timeout });
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
  async printPdf(html: string, options: PrintOptions): Promise<{ blocked: string[] }> {
    const margin = options.margin ?? { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" };
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
      await page.pdf({
        path: options.output,
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
      return { blocked: [...new Set(blocked)] };
    } catch (error) {
      throw new RenderError(`failed to render PDF: ${(error as Error).message}`);
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}

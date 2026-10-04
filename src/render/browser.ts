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

  /** A page for trusted code only (our own scripts); see `printPdf` for user content. */
  async newPage(): Promise<Page> {
    const page = await this.browser.newPage();
    page.setDefaultTimeout(this.timeout);
    return page;
  }

  /**
   * Print a complete HTML document to PDF. Page scripts are disabled: the document is fully
   * rendered by then (math by KaTeX, diagrams by Mermaid), and any <script> in the Markdown
   * must not run.
   */
  async printPdf(html: string, options: PrintOptions): Promise<void> {
    const margin = options.margin ?? { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" };
    const headerFooter =
      options.headerTemplate !== undefined || options.footerTemplate !== undefined;
    const page = await this.newPage();
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

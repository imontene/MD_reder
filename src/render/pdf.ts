import { launch, type Browser, type PDFOptions } from "puppeteer-core";
import { RenderError } from "../errors.js";

export interface PdfOptions {
  /** Path to a Chromium-based browser executable. */
  executablePath: string;
  /** Where to write the PDF. */
  output: string;
  format?: PDFOptions["format"];
  margin?: string;
  timeoutMs?: number;
}

function launchArgs(): string[] {
  const args = ["--disable-gpu", "--font-render-hinting=none"];
  // Chromium refuses to start its sandbox as root (common in containers and CI).
  const isRoot = process.platform !== "win32" && process.getuid?.() === 0;
  if (isRoot || process.env.MDRENDER_NO_SANDBOX === "1") {
    args.push("--no-sandbox");
  }
  return args;
}

/** Print a complete HTML document to PDF with a headless Chromium-based browser. */
export async function htmlToPdf(html: string, options: PdfOptions): Promise<void> {
  const timeout = options.timeoutMs ?? 60_000;
  const margin = options.margin ?? "20mm";

  let browser: Browser;
  try {
    browser = await launch({
      executablePath: options.executablePath,
      headless: true,
      args: launchArgs(),
      timeout,
    });
  } catch (error) {
    throw new RenderError(
      `could not start the browser at ${options.executablePath}: ${(error as Error).message}`,
    );
  }

  try {
    const page = await browser.newPage();
    // Phase 1 renders static content only: no page scripts.
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "load", timeout });
    // Make sure every embedded font has loaded before printing.
    await page.evaluate("document.fonts.ready.then(() => undefined)");
    await page.pdf({
      path: options.output,
      format: options.format ?? "A4",
      margin: { top: margin, right: margin, bottom: margin, left: margin },
      printBackground: true,
      timeout,
    });
  } catch (error) {
    throw new RenderError(`failed to render PDF: ${(error as Error).message}`);
  } finally {
    await browser.close();
  }
}

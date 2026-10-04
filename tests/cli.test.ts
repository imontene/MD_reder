import { execFile } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { ExitCode } from "../src/exit-codes.js";
import { version } from "../src/version.js";
import { fixture, tempDir } from "./helpers.js";

async function run(args: string[]) {
  let out = "";
  let err = "";
  const code = await main(args, { out: (t) => (out += t), err: (t) => (err += t) });
  return { code, out, err };
}

describe("main", () => {
  it("prints the version", async () => {
    const { code, out } = await run(["--version"]);
    expect(code).toBe(ExitCode.Ok);
    expect(out.trim()).toBe(version);
  });

  it("prints help", async () => {
    const { code, out } = await run(["--help"]);
    expect(code).toBe(ExitCode.Ok);
    expect(out).toContain("Usage: mdrender");
    expect(out).toContain("--format");
  });

  it("fails with a usage error when the input is missing", async () => {
    const { code, err } = await run([]);
    expect(code).toBe(ExitCode.Usage);
    expect(err).toContain("missing required argument");
  });

  it("fails with a usage error when the file does not exist", async () => {
    const { code, err } = await run(["no-existe.md"]);
    expect(code).toBe(ExitCode.Usage);
    expect(err).toContain("input file not found");
  });

  it("rejects an invalid format", async () => {
    const { code } = await run([fixture("basic.md"), "--format", "docx"]);
    expect(code).toBe(ExitCode.Usage);
  });

  it("writes a self-contained HTML file into an output directory", async () => {
    const dir = tempDir();
    const { code, out, err } = await run([fixture("sample.md"), "-f", "html", "-o", dir]);
    expect(err).toBe("");
    expect(code).toBe(ExitCode.Ok);

    const file = path.join(dir, "sample.html");
    expect(out.trim()).toBe(file);
    const html = readFileSync(file, "utf8");
    expect(html).toContain("<title>Documento de prueba</title>");
    expect(html).toContain("data:image/png;base64,");
  });

  it("creates missing output directories", async () => {
    const file = path.join(tempDir(), "a", "b", "doc.html");
    const { code } = await run([fixture("basic.md"), "-f", "html", "-o", file]);
    expect(code).toBe(ExitCode.Ok);
    expect(existsSync(file)).toBe(true);
  });

  it("reports missing images as warnings", async () => {
    const dir = tempDir();
    const { code, err } = await run([fixture("missing-image.md"), "-f", "html", "-o", dir]);
    expect(code).toBe(ExitCode.Ok);
    expect(err).toMatch(/warning: .*missing-image\.md:3: image not found: no-existe\.png/);
  });

  it("rejects an unknown Mermaid theme", async () => {
    const { code, err } = await run([fixture("basic.md"), "--mermaid-theme", "rosa"]);
    expect(code).toBe(ExitCode.Usage);
    expect(err).toContain("--mermaid-theme");
  });

  it("exits with code 2 and file:line diagnostics on render errors", async () => {
    const dir = tempDir();
    const { code, out, err } = await run([fixture("math-error.md"), "-f", "html", "-o", dir]);
    expect(code).toBe(ExitCode.Render);
    expect(out.trim()).toBe(path.join(dir, "math-error.html"));
    expect(err).toMatch(/error: .*math-error\.md:3: LaTeX: /);
    expect(err).toMatch(/error: .*math-error\.md:5: LaTeX: /);
  });

  it("needs a browser for HTML output when the document has diagrams", async () => {
    const missing = path.join(tempDir(), "no-browser");
    const args = [fixture("mermaid.md"), "-f", "html", "-o", tempDir(), "--browser", missing];
    const { code } = await run(args);
    expect(code).toBe(ExitCode.BrowserNotFound);
  });

  it("applies front matter: language, title block and table of contents", async () => {
    const dir = tempDir();
    const { code } = await run([fixture("document.md"), "-f", "html", "-o", dir]);
    expect(code).toBe(ExitCode.Ok);
    const html = readFileSync(path.join(dir, "document.html"), "utf8");
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<h1 class="doc-title">Informe técnico</h1>');
    expect(html).toContain('<p class="doc-meta">Equipo mdrender · 2026-10-04</p>');
    expect(html).toContain('<p class="toc-title">Contenido</p>');
    expect(html).toContain('<meta name="author" content="Equipo mdrender">');
  });

  it("lets command-line options win over front matter", async () => {
    const dir = tempDir();
    const args = [fixture("document.md"), "-f", "html", "-o", dir, "--lang", "en", "--title", "X"];
    expect((await run(args)).code).toBe(ExitCode.Ok);
    const html = readFileSync(path.join(dir, "document.html"), "utf8");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>X</title>");
    expect(html).toContain('<p class="toc-title">Contents</p>');
  });

  it("uses the nearest mdrender.config.json unless --no-config", async () => {
    const dir = tempDir();
    copyFileSync(fixture("basic.md"), path.join(dir, "doc.md"));
    writeFileSync(path.join(dir, "extra.css"), "body { --marca: #123456; }");
    writeFileSync(
      path.join(dir, "mdrender.config.json"),
      JSON.stringify({ lang: "fr", css: "extra.css", toc: true }),
    );
    const input = path.join(dir, "doc.md");

    expect((await run([input, "-f", "html"])).code).toBe(ExitCode.Ok);
    let html = readFileSync(path.join(dir, "doc.html"), "utf8");
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("--marca: #123456;");

    expect((await run([input, "-f", "html", "--no-config"])).code).toBe(ExitCode.Ok);
    html = readFileSync(path.join(dir, "doc.html"), "utf8");
    expect(html).toContain('<html lang="es">');
    expect(html).not.toContain("--marca");
  });

  it.each([
    [["--margin", "mucho"], /command line: --margin: invalid margin "mucho"/],
    [["--page-size", "B5"], /command line: --page-size must be one of/],
    [["--toc-depth", "0"], /--toc-depth must be a whole number/],
    [["--css", "no-existe.css"], /stylesheet not found: .*no-existe\.css/],
    [["--config", "no-existe.json"], /no-existe\.json: /],
  ])("rejects invalid options %j with a usage error", async (flags, message) => {
    const { code, err } = await run([fixture("basic.md"), "-f", "html", "-o", tempDir(), ...flags]);
    expect(code).toBe(ExitCode.Usage);
    expect(err).toMatch(message);
  });

  it("exits with code 3 when the browser cannot be found", async () => {
    const missing = path.join(tempDir(), "no-browser");
    const { code, err } = await run([fixture("basic.md"), "-o", tempDir(), "--browser", missing]);
    expect(code).toBe(ExitCode.BrowserNotFound);
    expect(err).toContain("browser not found");
  });
});

describe("executable", () => {
  it("runs as a real process via tsx", async () => {
    const require = createRequire(import.meta.url);
    const tsxCli = require.resolve("tsx/cli");
    const cli = fileURLToPath(new URL("../src/bin.ts", import.meta.url));
    const { stdout } = await promisify(execFile)(process.execPath, [tsxCli, cli, "--version"]);
    expect(stdout.trim()).toBe(version);
  });
});

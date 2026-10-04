import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
    expect(err).toContain("warning: image not found: no-existe.png");
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
    const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
    const { stdout } = await promisify(execFile)(process.execPath, [tsxCli, cli, "--version"]);
    expect(stdout.trim()).toBe(version);
  });
});

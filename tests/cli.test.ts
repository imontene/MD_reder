import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { ExitCode } from "../src/exit-codes.js";
import { version } from "../src/version.js";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

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

  it("accepts a valid Markdown input (rendering pending Phase 1)", async () => {
    const { code, err } = await run([fixture("basic.md")]);
    expect(code).toBe(ExitCode.Render);
    expect(err).toContain("basic.pdf");
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

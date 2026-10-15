import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { findOnPath, formatReport, runDoctor, type Check } from "../src/doctor.js";
import { ExitCode } from "../src/exit-codes.js";
import { browserRequired, tempDir, testBrowser } from "./helpers.js";

const byName = (checks: Check[], name: string) => checks.find((check) => check.name === name);

describe("mdrender doctor", () => {
  it("fails with advice when no browser can be found", async () => {
    const report = await runDoctor({
      browser: path.join(tempDir(), "no-browser"),
      config: false,
      env: { PATH: "" },
    });
    expect(report.ok).toBe(false);
    const browser = byName(report.checks, "Browser")!;
    expect(browser.status).toBe("fail");
    expect(browser.hint).toContain("mdrender setup");
    expect(formatReport(report)).toMatch(/\[fail\] Browser .*\n.*-> run `mdrender setup`/);
    expect(formatReport(report)).toContain("1 problem found.");
  });

  it("reports the config file, its typos and the effective settings", async () => {
    const dir = tempDir();
    writeFileSync(
      path.join(dir, "mdrender.config.json"),
      JSON.stringify({ pageSize: "A4", margn: "5mm", orientation: "landscape" }),
    );
    const report = await runDoctor({ cwd: dir, render: false, env: { PATH: "" } });
    const config = byName(report.checks, "Config")!;
    expect(config.status).toBe("warn");
    expect(config.detail).toContain('unknown option "margn" (did you mean "margin"?)');
    expect(byName(report.checks, "Settings")!.detail).toMatch(/^A4 landscape, margins 10mm/);
  });

  it("fails on an invalid config file", async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "mdrender.config.json"), "{ roto");
    const report = await runDoctor({ cwd: dir, render: false, env: { PATH: "" } });
    expect(byName(report.checks, "Config")!.status).toBe("fail");
    expect(report.ok).toBe(false);
  });

  it("finds mdrender on the PATH", () => {
    const bin = path.join(tempDir(), "bin");
    mkdirSync(bin);
    const name = process.platform === "win32" ? "mdrender.cmd" : "mdrender";
    writeFileSync(path.join(bin, name), "");
    chmodSync(path.join(bin, name), 0o755);
    const separator = process.platform === "win32" ? ";" : ":";
    expect(findOnPath({ PATH: `/nada${separator}${bin}` })).toBe(path.join(bin, name));
    expect(findOnPath({ PATH: "" })).toBeUndefined();
  });

  it("prints JSON with --json and exits 1 when something fails", async () => {
    let out = "";
    const code = await main(
      ["doctor", "--json", "--quick", "--no-config", "--browser", path.join(tempDir(), "x")],
      { out: (t) => void (out += t), err: () => undefined },
    );
    expect(code).toBe(ExitCode.Usage);
    const report = JSON.parse(out) as { ok: boolean; checks: Check[] };
    expect(report.ok).toBe(false);
    expect(byName(report.checks, "mdrender")!.status).toBe("ok");
  });
});

describe.skipIf(!testBrowser() && !browserRequired)("mdrender doctor with a browser", () => {
  it("starts the browser and converts a sample document", async () => {
    const report = await runDoctor({ config: false });
    expect(byName(report.checks, "Browser")!.status).toBe("ok");
    expect(byName(report.checks, "Browser start")!.detail).toMatch(/Chrome|Edg|Chromium/i);
    expect(byName(report.checks, "Test conversion")!.status).toBe("ok");
    expect(report.ok).toBe(true);
  });
});

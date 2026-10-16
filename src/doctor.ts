import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sea from "node:sea";
import { assetPath, PACKAGE_JSON } from "./assets.js";
import { cacheDir, installedBrowser } from "./browser/cache.js";
import { findBrowser } from "./browser/detect.js";
import { findConfigFile, readConfig } from "./config.js";
import { BrowserPool, convertFile } from "./convert.js";
import { DEFAULT_FONT_SIZE, mergeOptions, resolveMargins } from "./options.js";
import { version } from "./version.js";

export type CheckStatus = "ok" | "warn" | "fail" | "info";

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
  /** What to do about a warning or failure. */
  hint?: string;
}

export interface DoctorOptions {
  /** Explicit browser executable (as with --browser). */
  browser?: string;
  /** Config file to check; undefined: nearest to `cwd`; false: none. */
  config?: string | false;
  /** Start the browser and convert a sample document (the slow part). Default: true. */
  render?: boolean;
  cwd?: string;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
}

export interface DoctorReport {
  version: string;
  checks: Check[];
  ok: boolean;
}

const MIN_NODE: [number, number] = [22, 12];

function runningAsExecutable(): boolean {
  try {
    return sea.isSea();
  } catch {
    return false;
  }
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Where `mdrender` resolves on the PATH, like `which`/`where`. */
export function findOnPath(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const pathValue = Object.entries(env).find(([key]) => key.toUpperCase() === "PATH")?.[1] ?? "";
  const separator = platform === "win32" ? ";" : ":";
  const names =
    platform === "win32"
      ? ["mdrender.exe", "mdrender.cmd", "mdrender.ps1", "mdrender"]
      : ["mdrender"];
  const join = platform === "win32" ? path.win32.join : path.posix.join;
  for (const dir of pathValue.split(separator).filter(Boolean)) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

function installationChecks(env: Record<string, string | undefined>, platform: NodeJS.Platform) {
  const checks: Check[] = [];
  const executable = runningAsExecutable();
  checks.push({
    name: "mdrender",
    status: "ok",
    detail: executable
      ? `${version}, standalone executable (${process.execPath})`
      : `${version}, npm package (${path.dirname(assetPath(PACKAGE_JSON))})`,
  });

  if (!executable) {
    const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
    const [needMajor, needMinor] = MIN_NODE;
    const supported = major > needMajor || (major === needMajor && minor >= needMinor);
    checks.push({
      name: "Node.js",
      status: supported ? "ok" : "fail",
      detail: `${process.versions.node} (${process.execPath})`,
      hint: supported ? undefined : `mdrender needs Node.js ${needMajor}.${needMinor} or newer`,
    });
  }

  checks.push({
    name: "System",
    status: "info",
    detail: `${platform} ${process.arch}, ${os.release()}`,
  });

  const onPath = findOnPath(env, platform);
  checks.push(
    onPath
      ? { name: "PATH", status: "ok", detail: `mdrender found at ${onPath}` }
      : {
          name: "PATH",
          status: "warn",
          detail: "the mdrender command is not in any PATH folder",
          hint:
            "you can only run it by its full path or with npx; add its folder to PATH " +
            "(for npm: the output of `npm prefix -g`, plus /bin on Linux)",
        },
  );
  return checks;
}

function browserSource(
  found: string,
  explicit: string | undefined,
  env: Record<string, string | undefined>,
  downloaded: string | undefined,
): string {
  if (explicit) return "from --browser";
  if (env.MDRENDER_BROWSER) return "from MDRENDER_BROWSER";
  if (downloaded && path.resolve(found) === path.resolve(downloaded)) {
    return "downloaded by mdrender setup";
  }
  return "installed on this system";
}

function configChecks(options: DoctorOptions, cwd: string): Check[] {
  if (options.config === false) {
    return [{ name: "Config", status: "info", detail: "config files disabled (--no-config)" }];
  }
  const file = options.config ? path.resolve(cwd, options.config) : findConfigFile(cwd);
  if (!file) {
    const defaults = mergeOptions();
    return [
      {
        name: "Config",
        status: "info",
        detail: `no mdrender.config.json in ${cwd} or its parent folders; defaults apply`,
      },
      settingsCheck(defaults),
    ];
  }
  if (!existsSync(file)) {
    return [{ name: "Config", status: "fail", detail: `not found: ${file}` }];
  }
  try {
    const config = readConfig(file);
    const checks: Check[] = [
      config.warnings.length
        ? {
            name: "Config",
            status: "warn",
            detail: `${file}\n${config.warnings.map((w) => `  - ${w}`).join("\n")}`,
            hint: "fix or remove the options above; they are ignored",
          }
        : { name: "Config", status: "ok", detail: file },
    ];
    checks.push(settingsCheck(mergeOptions(config.options)));
    return checks;
  } catch (error) {
    return [{ name: "Config", status: "fail", detail: (error as Error).message }];
  }
}

function settingsCheck(options: ReturnType<typeof mergeOptions>): Check {
  const m = resolveMargins(options);
  return {
    name: "Settings",
    status: "info",
    detail:
      `${options.pageSize} ${options.orientation}, margins ${m.top} ${m.right} ${m.bottom} ` +
      `${m.left} (top right bottom left), ${options.font} ` +
      `${options.fontSize ?? DEFAULT_FONT_SIZE}, ${options.density} density, ` +
      `language ${options.lang}, theme ` +
      path.basename(options.theme),
  };
}

const SAMPLE = `# mdrender doctor

Equation: $e^{i\\pi} + 1 = 0$

\`\`\`mermaid
flowchart LR
  A[Markdown] --> B[PDF]
\`\`\`
`;

async function browserChecks(
  options: DoctorOptions,
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): Promise<Check[]> {
  const checks: Check[] = [];
  const dir = cacheDir(env, platform);
  const downloaded = installedBrowser(dir);
  checks.push({
    name: "Setup cache",
    status: "info",
    detail: downloaded ? `${dir} (contains ${downloaded})` : `${dir} (no downloaded browser)`,
  });

  let executable: string;
  try {
    executable = findBrowser(options.browser, {
      env,
      platform,
      downloaded: () => downloaded,
    });
  } catch (error) {
    checks.push({
      name: "Browser",
      status: "fail",
      detail: (error as Error).message.split("\n")[0]!,
      hint:
        "run `mdrender setup` to download one, install Chrome/Edge/Chromium, or point to " +
        "one with --browser <path> or MDRENDER_BROWSER",
    });
    return checks;
  }
  checks.push({
    name: "Browser",
    status: "ok",
    detail: `${executable} (${browserSource(executable, options.browser, env, downloaded)})`,
  });
  if (options.render === false) return checks;

  const notes: string[] = [];
  const pool = new BrowserPool(executable, (message) => notes.push(message));
  const work = mkdtempSync(path.join(os.tmpdir(), "mdrender-doctor-"));
  try {
    let started = Date.now();
    const session = await pool.get();
    const browserVersion = await session.version();
    const unsandboxed = notes.some((note) => note.includes("sandbox"));
    checks.push({
      name: "Browser start",
      status: unsandboxed ? "warn" : "ok",
      detail: `${browserVersion} in ${Date.now() - started} ms`,
      hint: unsandboxed
        ? "started without Chrome's sandbox (blocked by the system, e.g. Ubuntu 23.10+); " +
          "conversions still work. A browser installed from a package avoids it"
        : undefined,
    });

    const input = path.join(work, "doctor.md");
    writeFileSync(input, SAMPLE);
    started = Date.now();
    const result = await convertFile({
      input,
      output: path.join(work, "doctor.pdf"),
      format: "pdf",
      config: false,
      browsers: pool,
    });
    const problems = result.diagnostics.map((d) => d.message);
    checks.push({
      name: "Test conversion",
      status: problems.length ? "fail" : "ok",
      detail: problems.length
        ? problems.join("; ")
        : `PDF with an equation and a Mermaid diagram in ${Date.now() - started} ms`,
    });
  } catch (error) {
    checks.push({
      name: "Browser start",
      status: "fail",
      detail: (error as Error).message.split("\n")[0]!,
      hint: "try another browser with --browser <path>, or `mdrender setup --force`",
    });
  } finally {
    await pool.close();
    rmSync(work, { recursive: true, force: true });
  }
  return checks;
}

function networkChecks(env: Record<string, string | undefined>): Check[] {
  const proxy = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"].find((k) => env[k]);
  return proxy
    ? [{ name: "Proxy", status: "info", detail: `${proxy} is set (used by mdrender setup)` }]
    : [];
}

/** Inspect the installation, browser and configuration, and try a real conversion. */
export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const cwd = options.cwd ?? process.cwd();
  const checks = [
    ...installationChecks(env, platform),
    ...(await browserChecks(options, env, platform)),
    ...configChecks(options, cwd),
    ...networkChecks(env),
  ];
  return { version, checks, ok: !checks.some((check) => check.status === "fail") };
}

const LABEL: Record<CheckStatus, string> = {
  ok: "[ok]  ",
  warn: "[warn]",
  fail: "[fail]",
  info: "[info]",
};

/** Plain-text report; ASCII markers so it reads well in any Windows console. */
export function formatReport(report: DoctorReport): string {
  const width = Math.max(...report.checks.map((check) => check.name.length));
  const lines = report.checks.map((check) => {
    const [first, ...rest] = check.detail.split("\n");
    const head = `${LABEL[check.status]} ${check.name.padEnd(width)}  ${first}`;
    const more = rest.map((line) => `${" ".repeat(width + 9)}${line}`);
    const hint = check.hint ? [`${" ".repeat(width + 9)}-> ${check.hint}`] : [];
    return [head, ...more, ...hint].join("\n");
  });
  const failures = report.checks.filter((c) => c.status === "fail").length;
  const warnings = report.checks.filter((c) => c.status === "warn").length;
  const summary = report.ok
    ? `All good${warnings ? ` (${warnings} warning${warnings > 1 ? "s" : ""})` : ""}.`
    : `${failures} problem${failures > 1 ? "s" : ""} found.`;
  return `mdrender doctor\n\n${lines.join("\n")}\n\n${summary}\n`;
}

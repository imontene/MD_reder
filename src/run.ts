import path from "node:path";
import { BrowserPool, convertFile, type RenderSettings } from "./convert.js";
import { formatDiagnostic } from "./diagnostics.js";
import { MdRenderError } from "./errors.js";
import { ExitCode } from "./exit-codes.js";
import type { Job } from "./inputs.js";
import type { OutputFormat } from "./paths.js";

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
  /** Only warnings and errors: no output paths, summaries or progress. */
  quiet?: boolean;
  /** Also report the config file, browser and time of each conversion. */
  verbose?: boolean;
}

/** Progress messages (stderr), silenced by --quiet. */
export const info = (io: Io, text: string): void => {
  if (!io.quiet) io.err(text);
};

/** Display path: relative to the working directory when inside it. */
export function displayPath(file: string, cwd = process.cwd()): string {
  const relative = path.relative(cwd, file);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : file;
}

/**
 * Convert one file, report its diagnostics and return its exit code. Expected failures (bad
 * options, render errors) are reported, not thrown, so a batch can go on with the next file.
 */
export async function runJob(
  job: Job,
  format: OutputFormat,
  settings: RenderSettings,
  browsers: BrowserPool,
  io: Io,
): Promise<{ code: ExitCode; dependencies: string[] }> {
  const started = Date.now();
  try {
    const result = await convertFile({ ...settings, ...job, format, browsers });
    for (const diagnostic of result.diagnostics) {
      io.err(`${formatDiagnostic(diagnostic, displayPath(job.input))}\n`);
    }
    if (io.verbose && result.configFile) io.err(`config: ${result.configFile}\n`);
    if (!io.quiet) io.out(`${result.output}\n`);
    if (io.verbose) io.err(`${displayPath(job.input)}: ${Date.now() - started} ms\n`);
    // The file is still written (errors are shown inline) but the run counts as failed.
    const failed = result.diagnostics.some((d) => d.severity === "error");
    return { code: failed ? ExitCode.Render : ExitCode.Ok, dependencies: result.dependencies };
  } catch (error) {
    if (error instanceof MdRenderError) {
      io.err(`error: ${displayPath(job.input)}: ${error.message}\n`);
      return { code: error.exitCode, dependencies: [] };
    }
    throw error;
  }
}

/** Convert every job with one shared browser. The exit code is the most severe one. */
export async function runJobs(
  jobs: Job[],
  format: OutputFormat,
  settings: RenderSettings,
  io: Io,
  browsers = new BrowserPool(settings.browser, (file) => {
    if (io.verbose) io.err(`browser: ${file}\n`);
  }),
): Promise<ExitCode> {
  let worst: ExitCode = ExitCode.Ok;
  let failed = 0;
  try {
    for (const job of jobs) {
      const { code } = await runJob(job, format, settings, browsers, io);
      if (code !== ExitCode.Ok) failed++;
      worst = Math.max(worst, code) as ExitCode;
      // Without a browser no other PDF can be produced either.
      if (code === ExitCode.BrowserNotFound) break;
    }
  } finally {
    await browsers.close();
  }
  if (jobs.length > 1) {
    info(io, `${jobs.length} files, ${jobs.length - failed} ok, ${failed} with errors\n`);
  }
  return worst;
}

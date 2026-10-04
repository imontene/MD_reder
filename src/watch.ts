import { existsSync } from "node:fs";
import path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import { isDynamicPattern } from "tinyglobby";
import { BrowserPool, type RenderSettings } from "./convert.js";
import { MdRenderError } from "./errors.js";
import { ExitCode } from "./exit-codes.js";
import { expandInputs, planOutputs, type Job } from "./inputs.js";
import { isMarkdownFile, type OutputFormat } from "./paths.js";
import { displayPath, runJob, type Io } from "./run.js";

export interface WatchOptions {
  inputs: string[];
  format: OutputFormat;
  output?: string;
  settings: RenderSettings;
  io: Io;
  /** Watching stops when this signal aborts (Ctrl+C in the CLI). */
  signal: AbortSignal;
  cwd?: string;
  /** Wait for changes to settle before re-rendering (ms). */
  debounceMs?: number;
}

/** Paths to watch for the command-line inputs: files, folders, or a glob's base folder. */
export function watchRoots(inputs: string[], cwd: string): string[] {
  return inputs.map((input) => {
    const resolved = path.resolve(cwd, input);
    if (existsSync(resolved)) return resolved;
    const pattern = input.replace(/\\/g, "/");
    if (!isDynamicPattern(pattern)) return resolved;
    const fixed: string[] = [];
    for (const part of pattern.split("/")) {
      if (isDynamicPattern(part)) break;
      fixed.push(part);
    }
    return path.resolve(cwd, fixed.join("/") || ".");
  });
}

const time = () => new Date().toTimeString().slice(0, 8);

/**
 * Convert the inputs, then convert again whenever they change, until `signal` aborts.
 *
 * A changed Markdown file is re-rendered alone; any other change (config file, stylesheet,
 * image) re-renders everything. New files under watched folders or globs are picked up.
 */
export async function watchAndConvert(options: WatchOptions): Promise<ExitCode> {
  const { format, settings, io, signal, cwd = process.cwd() } = options;
  const browsers = new BrowserPool(settings.browser);
  const dependencies = new Set<string>();
  let jobs: Job[] = [];
  let watcher: FSWatcher | undefined = undefined;

  const plan = (): Job[] =>
    planOutputs(expandInputs(options.inputs, cwd), format, options.output, cwd);

  const convert = async (selected: Job[]) => {
    for (const job of selected) {
      io.err(`[${time()}] ${displayPath(job.input, cwd)}\n`);
      const result = await runJob(job, format, settings, browsers, io);
      // Also watch the config files and stylesheets the documents use.
      for (const dep of result.dependencies) {
        if (!dependencies.has(dep)) {
          dependencies.add(dep);
          watcher?.add(dep);
        }
      }
      if (result.code === ExitCode.BrowserNotFound) return;
    }
  };

  try {
    jobs = plan();
  } catch (error) {
    if (error instanceof MdRenderError) {
      io.err(`error: ${error.message}\n`);
      return error.exitCode;
    }
    throw error;
  }

  // Do not react to our own output files (e.g. HTML written next to the Markdown).
  const outputs = () => new Set(jobs.map((j) => j.output));
  watcher = watch(watchRoots(options.inputs, cwd), {
    ignoreInitial: true,
    ignored: (file) => {
      const name = path.basename(file);
      return name === "node_modules" || (name.startsWith(".") && name !== ".");
    },
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
  });
  await new Promise<void>((resolve) => watcher!.once("ready", () => resolve()));

  await convert(jobs);
  io.err(`Watching for changes (Ctrl+C to stop)…\n`);

  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  let running = Promise.resolve();

  const flush = () => {
    const changed = [...pending];
    pending.clear();
    running = running.then(async () => {
      try {
        jobs = plan();
      } catch (error) {
        if (error instanceof MdRenderError) {
          io.err(`error: ${error.message}\n`);
          return;
        }
        throw error;
      }
      const all = changed.some((file) => !isMarkdownFile(file) || dependencies.has(file));
      const selected = all ? jobs : jobs.filter((job) => changed.includes(job.input));
      await convert(selected);
    });
  };

  watcher.on("all", (event, file) => {
    const resolved = path.resolve(file);
    if (event === "unlink" || event === "unlinkDir" || event === "addDir") return;
    if (outputs().has(resolved)) return;
    pending.add(resolved);
    clearTimeout(timer);
    timer = setTimeout(flush, options.debounceMs ?? 150);
  });

  await new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener("abort", () => resolve(), { once: true });
  });

  clearTimeout(timer);
  await running.catch(() => undefined);
  await watcher.close();
  await browsers.close();
  return ExitCode.Ok;
}

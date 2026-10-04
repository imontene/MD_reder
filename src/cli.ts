#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Command, CommanderError, Option } from "commander";
import type { RenderSettings } from "./convert.js";
import { MdRenderError } from "./errors.js";
import { ExitCode } from "./exit-codes.js";
import { expandInputs, planOutputs } from "./inputs.js";
import { MERMAID_THEMES, normalizeOptions, PAGE_SIZES, type DocumentOptions } from "./options.js";
import type { OutputFormat } from "./paths.js";
import { preview } from "./preview.js";
import { runJobs, type Io } from "./run.js";
import { version } from "./version.js";
import { watchAndConvert } from "./watch.js";

interface RenderCliOptions {
  output?: string;
  format: OutputFormat;
  watch?: boolean;
  browser?: string;
  config?: string | false;
}

interface PreviewCliOptions {
  port?: string;
  open: boolean;
  browser?: string;
  config?: string | false;
}

/** Command-line flags that map to document options (camelCase = DocumentOptions key). */
const DOCUMENT_FLAGS = [
  "pageSize",
  "margin",
  "landscape",
  "toc",
  "tocDepth",
  "header",
  "footer",
  "pageNumbers",
  "css",
  "theme",
  "mermaidTheme",
  "lang",
  "title",
] as const;

const toFlag = (key: string) => "--" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

const defaultIo: Io = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

const collect = (value: string, previous: string[] = []) => [...previous, value];

/** Options shared by `mdrender` (render) and `mdrender preview`. */
function addDocumentOptions(command: Command): Command {
  return command
    .option("--page-size <size>", `paper size: ${PAGE_SIZES.join(", ")} (default: A4)`)
    .option("--margin <margin>", 'page margins, e.g. "20mm" or "15mm 20mm" (default: 20mm)')
    .option("--landscape", "landscape orientation")
    .option("--toc", "insert a table of contents (or place it with [[toc]])")
    .option("--toc-depth <n>", "deepest heading level in the table of contents (default: 3)")
    .option("--header <text>", 'page header, e.g. "{title} | | {date}"')
    .option("--footer <text>", 'page footer (default: "{page} / {pages}")')
    .option("--no-page-numbers", "no default page-number footer")
    .option("--theme <theme>", "light, dark, or a .css file replacing the theme (default: light)")
    .option("--css <file>", "extra stylesheet (repeatable)", collect)
    .option(
      "--mermaid-theme <theme>",
      `Mermaid theme: ${MERMAID_THEMES.join(", ")} (default: neutral; dark with --theme dark)`,
    )
    .option("--lang <tag>", "document language, e.g. es or en (default: es)")
    .option("--title <text>", "document title (shown as a title block)")
    .option("--config <file>", "config file (default: nearest mdrender.config.json)")
    .option("--no-config", "ignore mdrender.config.json files")
    .option("--browser <path>", "Chrome, Edge or Chromium executable (default: auto-detect)");
}

function configure(command: Command, io: Io): Command {
  return command.exitOverride().configureOutput({ writeOut: io.out, writeErr: io.err });
}

function buildRenderProgram(io: Io): Command {
  const program = new Command()
    .name("mdrender")
    .description("Render Markdown files to PDF (or self-contained HTML) using the Inter typeface.")
    .version(version, "-V, --version")
    .argument("<inputs...>", "Markdown files, folders or glob patterns (e.g. docs/**/*.md)")
    .option("-o, --output <path>", "output file, or folder for several inputs")
    .addOption(
      new Option("-f, --format <format>", "output format").choices(["pdf", "html"]).default("pdf"),
    )
    .option("-w, --watch", "convert again whenever the inputs change");
  addDocumentOptions(program).addHelpText(
    "after",
    `
Commands:
  mdrender preview <file>  live HTML preview in the browser (see: mdrender preview --help)

Header/footer placeholders: {page} {pages} {title} {author} {date}; "|" separates
left | center | right columns.

Options can also be set in YAML front matter or in mdrender.config.json
(command line > front matter > config file).`,
  );
  return configure(program, io);
}

function buildPreviewProgram(io: Io): Command {
  const program = new Command()
    .name("mdrender preview")
    .description("Live HTML preview of a Markdown file, reloaded on every change.")
    .argument("<input>", "Markdown file")
    .option("--port <port>", "port on 127.0.0.1 (default: a free port)")
    .option("--no-open", "do not open the browser, only print the URL");
  addDocumentOptions(program);
  return configure(program, io);
}

/** Document options given explicitly on the command line (not commander defaults). */
function cliOverrides(program: Command): Partial<DocumentOptions> {
  const raw: Record<string, unknown> = {};
  for (const key of DOCUMENT_FLAGS) {
    if (program.getOptionValueSource(key) === "cli") raw[key] = program.getOptionValue(key);
  }
  return normalizeOptions(raw, "command line", process.cwd(), (key) =>
    key === "pageNumbers" ? "--no-page-numbers" : toFlag(key),
  );
}

function settings(
  program: Command,
  options: { browser?: string; config?: string | false },
): RenderSettings {
  return { browser: options.browser, config: options.config, overrides: cliOverrides(program) };
}

async function parse(program: Command, argv: string[]): Promise<number | undefined> {
  try {
    await program.parseAsync(argv, { from: "user" });
    return undefined;
  } catch (error) {
    if (error instanceof CommanderError) {
      // --help and --version are reported by commander as "errors" with exit code 0.
      return error.exitCode === 0 ? ExitCode.Ok : ExitCode.Usage;
    }
    throw error;
  }
}

export interface MainOptions {
  /** Stops --watch and preview (the CLI aborts it on Ctrl+C). */
  signal?: AbortSignal;
}

async function runPreview(argv: string[], io: Io, signal: AbortSignal): Promise<number> {
  const program = buildPreviewProgram(io);
  const parsed = await parse(program, argv);
  if (parsed !== undefined) return parsed;
  const options = program.opts<PreviewCliOptions>();
  const port = options.port === undefined ? 0 : Number(options.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    io.err(`error: invalid port: ${options.port}\n`);
    return ExitCode.Usage;
  }
  const [input] = expandInputs(program.args);
  return preview({
    input: input!.file,
    settings: settings(program, options),
    io,
    signal,
    port,
    open: options.open,
  });
}

async function runRender(argv: string[], io: Io, signal: AbortSignal): Promise<number> {
  const program = buildRenderProgram(io);
  const parsed = await parse(program, argv);
  if (parsed !== undefined) return parsed;
  const options = program.opts<RenderCliOptions>();
  const run = settings(program, options);

  if (options.watch) {
    return watchAndConvert({
      inputs: program.args,
      format: options.format,
      output: options.output,
      settings: run,
      io,
      signal,
    });
  }
  const jobs = planOutputs(expandInputs(program.args), options.format, options.output);
  return runJobs(jobs, options.format, run, io);
}

/** Run the CLI and return the exit code instead of exiting, so it can be tested in-process. */
export async function main(
  argv: string[],
  io: Io = defaultIo,
  { signal = new AbortController().signal }: MainOptions = {},
): Promise<number> {
  try {
    return argv[0] === "preview"
      ? await runPreview(argv.slice(1), io, signal)
      : await runRender(argv, io, signal);
  } catch (error) {
    if (error instanceof MdRenderError) {
      io.err(`error: ${error.message}\n`);
      return error.exitCode;
    }
    throw error;
  }
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());
  process.exitCode = await main(process.argv.slice(2), defaultIo, { signal: controller.signal });
}

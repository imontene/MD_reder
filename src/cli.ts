#!/usr/bin/env node
import { existsSync, realpathSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Command, CommanderError, Option } from "commander";
import { convertFile } from "./convert.js";
import { formatDiagnostic } from "./diagnostics.js";
import { MdRenderError } from "./errors.js";
import { ExitCode } from "./exit-codes.js";
import { MERMAID_THEMES, normalizeOptions, PAGE_SIZES, type DocumentOptions } from "./options.js";
import { isMarkdownFile, resolveOutputPath, type OutputFormat } from "./paths.js";
import { version } from "./version.js";

interface CliOptions {
  output?: string;
  format: OutputFormat;
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
  "mermaidTheme",
  "lang",
  "title",
] as const;

const toFlag = (key: string) => "--" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

const defaultIo: Io = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

const collect = (value: string, previous: string[] = []) => [...previous, value];

function buildProgram(io: Io): Command {
  return new Command()
    .name("mdrender")
    .description("Render Markdown files to PDF (or self-contained HTML) using the Inter typeface.")
    .version(version, "-V, --version")
    .argument("<input>", "Markdown file to render")
    .option("-o, --output <path>", "output file or directory")
    .addOption(
      new Option("-f, --format <format>", "output format").choices(["pdf", "html"]).default("pdf"),
    )
    .option("--page-size <size>", `paper size: ${PAGE_SIZES.join(", ")} (default: A4)`)
    .option("--margin <margin>", 'page margins, e.g. "20mm" or "15mm 20mm" (default: 20mm)')
    .option("--landscape", "landscape orientation")
    .option("--toc", "insert a table of contents (or place it with [[toc]])")
    .option("--toc-depth <n>", "deepest heading level in the table of contents (default: 3)")
    .option("--header <text>", 'page header, e.g. "{title} | | {date}"')
    .option("--footer <text>", 'page footer (default: "{page} / {pages}")')
    .option("--no-page-numbers", "no default page-number footer")
    .option("--css <file>", "extra stylesheet (repeatable)", collect)
    .option(
      "--mermaid-theme <theme>",
      `Mermaid diagram theme: ${MERMAID_THEMES.join(", ")} (default: neutral)`,
    )
    .option("--lang <tag>", "document language, e.g. es or en (default: en)")
    .option("--title <text>", "document title (shown as a title block)")
    .option("--config <file>", "config file (default: nearest mdrender.config.json)")
    .option("--no-config", "ignore mdrender.config.json files")
    .option("--browser <path>", "Chrome, Edge or Chromium executable (default: auto-detect)")
    .addHelpText(
      "after",
      `
Header/footer placeholders: {page} {pages} {title} {author} {date}; "|" separates
left | center | right columns.

Options can also be set in YAML front matter or in mdrender.config.json
(command line > front matter > config file).`,
    )
    .exitOverride()
    .configureOutput({ writeOut: io.out, writeErr: io.err });
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

/** Run the CLI and return the exit code instead of exiting, so it can be tested in-process. */
export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  const program = buildProgram(io);

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      // --help and --version are reported by commander as "errors" with exit code 0.
      return error.exitCode === 0 ? ExitCode.Ok : ExitCode.Usage;
    }
    throw error;
  }

  const [input] = program.args as [string];
  const options = program.opts<CliOptions>();

  if (!existsSync(input) || !statSync(input).isFile()) {
    io.err(`error: input file not found: ${input}\n`);
    return ExitCode.Usage;
  }
  if (!isMarkdownFile(input)) {
    io.err(`error: input is not a Markdown file (.md, .markdown): ${input}\n`);
    return ExitCode.Usage;
  }

  const outputIsDir =
    options.output !== undefined &&
    existsSync(options.output) &&
    statSync(options.output).isDirectory();
  const target = resolveOutputPath(input, options.format, options.output, outputIsDir);

  try {
    const result = await convertFile({
      input,
      output: target,
      format: options.format,
      browser: options.browser,
      config: options.config,
      overrides: cliOverrides(program),
    });
    for (const diagnostic of result.diagnostics) {
      io.err(`${formatDiagnostic(diagnostic, input)}\n`);
    }
    io.out(`${result.output}\n`);
    // The file is still written (errors are shown inline) but the run counts as failed.
    const failed = result.diagnostics.some((d) => d.severity === "error");
    return failed ? ExitCode.Render : ExitCode.Ok;
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
  process.exitCode = await main(process.argv.slice(2));
}

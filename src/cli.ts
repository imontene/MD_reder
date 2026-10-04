#!/usr/bin/env node
import { existsSync, realpathSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Command, CommanderError, Option } from "commander";
import { convertFile } from "./convert.js";
import { formatDiagnostic } from "./diagnostics.js";
import { MdRenderError } from "./errors.js";
import { ExitCode } from "./exit-codes.js";
import { isMarkdownFile, resolveOutputPath, type OutputFormat } from "./paths.js";
import { MERMAID_THEMES, type MermaidTheme } from "./render/mermaid.js";
import { version } from "./version.js";

interface CliOptions {
  output?: string;
  format: OutputFormat;
  browser?: string;
  mermaidTheme: MermaidTheme;
}

interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

const defaultIo: Io = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

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
    .addOption(
      new Option("--mermaid-theme <theme>", "Mermaid diagram theme")
        .choices(MERMAID_THEMES)
        .default("neutral"),
    )
    .option("--browser <path>", "Chrome, Edge or Chromium executable (default: auto-detect)")
    .exitOverride()
    .configureOutput({ writeOut: io.out, writeErr: io.err });
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
      mermaidTheme: options.mermaidTheme,
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

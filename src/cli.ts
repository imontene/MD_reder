#!/usr/bin/env node
import { existsSync, realpathSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Command, CommanderError, Option } from "commander";
import { ExitCode } from "./exit-codes.js";
import { isMarkdownFile, resolveOutputPath, type OutputFormat } from "./paths.js";
import { version } from "./version.js";

interface CliOptions {
  output?: string;
  format: OutputFormat;
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
    .description("Render Markdown files (with math and Mermaid) to PDF using the Inter typeface.")
    .version(version, "-V, --version")
    .argument("<input>", "Markdown file to render")
    .option("-o, --output <path>", "output file or directory")
    .addOption(
      new Option("-f, --format <format>", "output format").choices(["pdf", "html"]).default("pdf"),
    )
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

  // Rendering arrives in Phase 1 (see docs/PLAN_MAESTRO.md).
  io.err(`mdrender: rendering is not implemented yet (would write ${target})\n`);
  return ExitCode.Render;
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

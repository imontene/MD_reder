import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { globSync, isDynamicPattern } from "tinyglobby";
import { OptionsError } from "./options.js";
import { isMarkdownFile, type OutputFormat } from "./paths.js";

/** A Markdown file to convert, with the folder its output path is relative to. */
export interface InputFile {
  file: string;
  /** Directory or glob base the file was found under; undefined for files named directly. */
  root?: string;
}

/** Folders never searched when an input is a directory or a glob. */
const SKIPPED_DIRS = new Set(["node_modules"]);

function walk(dir: string, found: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIPPED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.isFile() && isMarkdownFile(entry.name)) found.push(full);
  }
}

/** Leading part of a glob without wildcards, e.g. "docs/" for "docs/**\/*.md". */
function globBase(pattern: string): string {
  const parts = pattern.split("/");
  const fixed: string[] = [];
  for (const part of parts.slice(0, -1)) {
    if (isDynamicPattern(part)) break;
    fixed.push(part);
  }
  return fixed.join("/") || ".";
}

/**
 * Expand command-line inputs into Markdown files: files as given, folders searched recursively
 * (skipping hidden folders and node_modules), and glob patterns (`docs/**\/*.md`) expanded here
 * so they also work in Windows shells, which do not expand them.
 */
export function expandInputs(inputs: string[], cwd = process.cwd()): InputFile[] {
  const files: InputFile[] = [];

  for (const input of inputs) {
    const resolved = path.resolve(cwd, input);
    if (existsSync(resolved)) {
      if (statSync(resolved).isDirectory()) {
        const found: string[] = [];
        walk(resolved, found);
        if (found.length === 0) throw new OptionsError(`no Markdown files in folder: ${input}`);
        files.push(...found.sort().map((file) => ({ file, root: resolved })));
      } else if (isMarkdownFile(resolved)) {
        files.push({ file: resolved });
      } else {
        throw new OptionsError(`input is not a Markdown file (.md, .markdown): ${input}`);
      }
      continue;
    }

    const pattern = input.replace(/\\/g, "/");
    if (isDynamicPattern(pattern)) {
      const matches = globSync(pattern, {
        cwd,
        absolute: true,
        onlyFiles: true,
        ignore: ["**/node_modules/**", "**/.*/**"],
      })
        .filter(isMarkdownFile)
        .map((file) => path.resolve(file))
        .sort();
      if (matches.length === 0) throw new OptionsError(`no Markdown files match: ${input}`);
      const root = path.resolve(cwd, globBase(pattern));
      files.push(...matches.map((file) => ({ file, root })));
      continue;
    }

    throw new OptionsError(`input file not found: ${input}`);
  }

  // The same file may be reached twice (e.g. a folder and a glob): keep the first.
  const seen = new Set<string>();
  return files.filter(({ file }) => !seen.has(file) && seen.add(file));
}

export interface Job {
  input: string;
  output: string;
}

/**
 * Decide each output path.
 *
 * - No `output`: next to each Markdown file.
 * - One input file and `output` is not a folder: `output` is the file to write.
 * - Otherwise `output` is a folder; files found under a folder or glob keep their relative
 *   path inside it, so `docs/a/x.md` → `out/a/x.pdf`.
 */
export function planOutputs(
  inputs: InputFile[],
  format: OutputFormat,
  output?: string,
  cwd = process.cwd(),
): Job[] {
  const ext = `.${format}`;
  const outDir = output !== undefined ? path.resolve(cwd, output) : undefined;
  const several = inputs.length > 1 || inputs[0]?.root !== undefined;
  const looksLikeFile = output !== undefined && /\.(pdf|html?)$/i.test(output);
  const outputIsDir =
    outDir !== undefined &&
    (/[\\/]$/.test(output!) ||
      (existsSync(outDir) ? statSync(outDir).isDirectory() : several && !looksLikeFile));

  if (outDir && !outputIsDir) {
    if (several) {
      throw new OptionsError(`with several input files, --output must be a folder: ${output}`);
    }
    return [{ input: inputs[0]!.file, output: outDir }];
  }

  const jobs = inputs.map(({ file, root }) => {
    const name = path.parse(file).name + ext;
    if (!outDir) return { input: file, output: path.join(path.dirname(file), name) };
    const relativeDir = root ? path.relative(root, path.dirname(file)) : "";
    return { input: file, output: path.join(outDir, relativeDir, name) };
  });

  const targets = new Map<string, string>();
  for (const job of jobs) {
    const key = process.platform === "win32" ? job.output.toLowerCase() : job.output;
    const other = targets.get(key);
    if (other) {
      throw new OptionsError(`${other} and ${job.input} would both be written to ${job.output}`);
    }
    targets.set(key, job.input);
  }
  return jobs;
}

import path from "node:path";

export type OutputFormat = "pdf" | "html";

/**
 * Compute the output file for an input Markdown file.
 *
 * - No `output`: same directory and base name as the input, with the format's extension.
 * - `output` ending in a path separator, or `outputIsDir`: a file inside that directory.
 * - Otherwise `output` is used as the file path.
 *
 * `pathImpl` lets tests exercise Windows and POSIX semantics on any OS.
 */
export function resolveOutputPath(
  input: string,
  format: OutputFormat,
  output?: string,
  outputIsDir = false,
  pathImpl: path.PlatformPath = path,
): string {
  const parsed = pathImpl.parse(input);
  const fileName = `${parsed.name}.${format}`;

  if (!output) {
    return pathImpl.join(parsed.dir, fileName);
  }
  const endsWithSep = output.endsWith("/") || output.endsWith(pathImpl.sep);
  if (outputIsDir || endsWithSep) {
    return pathImpl.join(output, fileName);
  }
  return output;
}

export function isMarkdownFile(file: string): boolean {
  return /\.(md|markdown)$/i.test(file);
}

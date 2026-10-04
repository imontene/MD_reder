export type OutputFormat = "pdf" | "html";

export function isMarkdownFile(file: string): boolean {
  return /\.(md|markdown)$/i.test(file);
}

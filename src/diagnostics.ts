export interface Diagnostic {
  severity: "warning" | "error";
  message: string;
  /** 1-based line in the Markdown source, when known. */
  line?: number;
}

/** `file:line: message`, the conventional compiler-style location prefix. */
export function formatDiagnostic(diagnostic: Diagnostic, file?: string): string {
  const location = [file, diagnostic.line].filter((part) => part !== undefined).join(":");
  return `${diagnostic.severity}: ${location ? `${location}: ` : ""}${diagnostic.message}`;
}

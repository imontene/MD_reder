import { parse } from "yaml";
import { OptionsError } from "./options.js";

export interface FrontMatter {
  data: Record<string, unknown>;
  /**
   * The Markdown without the front matter block. The block is replaced by empty lines so that
   * line numbers in diagnostics still match the original file.
   */
  body: string;
}

const BLOCK = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

/** Split a leading YAML front matter block (`---` ... `---`) from the Markdown source. */
export function extractFrontMatter(source: string, file = "front matter"): FrontMatter {
  const text = source.replace(/^\uFEFF/, "");
  const match = BLOCK.exec(text);
  if (!match) return { data: {}, body: text };

  let data: unknown;
  try {
    data = parse(match[1]!) ?? {};
  } catch (error) {
    throw new OptionsError(`${file}: invalid YAML front matter: ${(error as Error).message}`);
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new OptionsError(`${file}: front matter must be a set of "key: value" pairs`);
  }

  const lines = match[0].split("\n").length - 1;
  return {
    data: data as Record<string, unknown>,
    body: "\n".repeat(lines) + text.slice(match[0].length),
  };
}

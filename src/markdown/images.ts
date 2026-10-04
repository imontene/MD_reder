import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Env, MarkdownIt } from "markdown-it";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

export interface ImageEnv extends Env {
  /** Directory that relative image paths are resolved against (the .md file's folder). */
  baseDir: string;
  warnings: string[];
}

/** Resolve an image `src` to a local file path, or undefined for remote/data URLs. */
export function localImagePath(src: string, baseDir: string): string | undefined {
  if (/^data:/i.test(src)) return undefined;
  if (/^file:/i.test(src)) return fileURLToPath(src);
  // Any other URL scheme (http:, https:, ...) but not a Windows drive letter like C:\
  if (/^[a-z][a-z0-9+.-]+:/i.test(src) && !/^[a-z]:[\\/]/i.test(src)) return undefined;

  const withoutQuery = src.replace(/[?#].*$/, "");
  let decoded = withoutQuery;
  try {
    decoded = decodeURI(withoutQuery);
  } catch {
    // keep the raw path if it is not valid percent-encoding
  }
  return path.resolve(baseDir, decoded);
}

function toDataUri(file: string): string | undefined {
  const mime = MIME_TYPES[path.extname(file).toLowerCase()];
  if (!mime) return undefined;
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

/**
 * Embed local images as data URIs so the output is self-contained and the browser never needs
 * file system access. Remote images are left untouched.
 */
export function inlineLocalImages(md: MarkdownIt): void {
  const fallback = md.renderer.rules.image!;

  md.renderer.rules.image = (tokens, idx, options, rawEnv, self) => {
    const env = rawEnv as ImageEnv | undefined;
    const token = tokens[idx]!;
    const src = String(token.attrGet("src") ?? "");
    const file = src && env?.baseDir ? localImagePath(src, env.baseDir) : undefined;

    if (env && file) {
      if (!existsSync(file) || !statSync(file).isFile()) {
        env.warnings.push(`image not found: ${src}`);
      } else {
        const dataUri = toDataUri(file);
        if (dataUri) token.attrSet("src", dataUri);
        else env.warnings.push(`unsupported image type: ${src}`);
      }
    }
    return fallback(tokens, idx, options, env, self);
  };
}

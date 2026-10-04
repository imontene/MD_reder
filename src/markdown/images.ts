import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MarkdownIt } from "markdown-it";
import { tokenLine, type RenderEnv } from "./env.js";

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

function warn(env: RenderEnv, message: string, line?: number): void {
  env.diagnostics.push({ severity: "warning", message, line });
}

/**
 * Replace a local image reference by a data URI. Returns the new src, or undefined to keep the
 * original (remote URL, data URI, or a problem that was reported as a warning).
 */
function embed(src: string, env: RenderEnv, line: number | undefined): string | undefined {
  const file = localImagePath(src, env.baseDir);
  if (!file) return undefined;
  if (!existsSync(file) || !statSync(file).isFile()) {
    warn(env, `image not found: ${src}`, line);
    return undefined;
  }
  const dataUri = toDataUri(file);
  if (!dataUri) warn(env, `unsupported image type: ${src}`, line);
  return dataUri;
}

const HTML_IMG_SRC = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gi;

/**
 * Embed local images as data URIs so the output is self-contained and the browser never needs
 * file system access: Markdown images (`![alt](img.png)`) and `<img src="img.png">` in raw HTML.
 * Remote images are left untouched.
 */
export function inlineLocalImages(md: MarkdownIt): void {
  const fallback = md.renderer.rules.image!;

  md.renderer.rules.image = (tokens, idx, options, rawEnv, self) => {
    const env = rawEnv as RenderEnv | undefined;
    const token = tokens[idx]!;
    const src = String(token.attrGet("src") ?? "");
    const dataUri = src && env?.baseDir ? embed(src, env, tokenLine(token)) : undefined;
    if (dataUri) token.attrSet("src", dataUri);
    return fallback(tokens, idx, options, env, self);
  };

  for (const rule of ["html_block", "html_inline"] as const) {
    const original = md.renderer.rules[rule]!;
    md.renderer.rules[rule] = (tokens, idx, options, rawEnv, self) => {
      const env = rawEnv as RenderEnv | undefined;
      const token = tokens[idx]!;
      if (env?.baseDir && /<img\b/i.test(token.content)) {
        token.content = token.content.replace(
          HTML_IMG_SRC,
          (match, prefix: string, quote: string, src: string) => {
            const dataUri = embed(md.utils.unescapeAll(src), env, tokenLine(token));
            return dataUri ? `${prefix}${quote}${dataUri}${quote}` : match;
          },
        );
      }
      return original(tokens, idx, options, env, self);
    };
  }
}

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

let cached: string | undefined;

/** KaTeX's stylesheet with its woff2 fonts embedded (woff/ttf fallbacks dropped). */
export function katexCss(): string {
  if (cached) return cached;
  const cssFile = require.resolve("katex/dist/katex.min.css");
  const dir = path.dirname(cssFile);
  cached = readFileSync(cssFile, "utf8")
    .replace(/,url\([^)]+\.woff\) format\("woff"\)/g, "")
    .replace(/,url\([^)]+\.ttf\) format\("truetype"\)/g, "")
    .replace(/url\((fonts\/[^)]+\.woff2)\)/g, (_match, rel: string) => {
      const data = readFileSync(path.join(dir, rel)).toString("base64");
      return `url(data:font/woff2;base64,${data})`;
    });
  return cached;
}

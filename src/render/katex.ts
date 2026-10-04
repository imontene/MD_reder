import { KATEX_CSS, readAsset, readTextAsset, woff2References } from "../assets.js";

let cached: string | undefined;

/** KaTeX's stylesheet with its woff2 fonts embedded (woff/ttf fallbacks dropped). */
export function katexCss(): string {
  if (cached) return cached;
  const css = readTextAsset(KATEX_CSS);
  const fonts = woff2References(KATEX_CSS, css);
  let index = 0;
  cached = css
    .replace(/,url\([^)]+\.woff\) format\("woff"\)/g, "")
    .replace(/,url\([^)]+\.ttf\) format\("truetype"\)/g, "")
    .replace(/url\(([^)]+\.woff2)\)/g, () => {
      const data = readAsset(fonts[index++]!).toString("base64");
      return `url(data:font/woff2;base64,${data})`;
    });
  return cached;
}

import hljs from "highlight.js/lib/common";
import { escapeHtml } from "../html.js";

/**
 * Syntax highlighting for fenced code with a language (` ```ts `). highlight.js's "common" set
 * covers ~35 popular languages. Unknown or missing languages are shown as plain text: no
 * auto-detection, so output never changes with heuristics.
 */
export function highlightCode(code: string, lang: string): string {
  const language = lang.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (language && hljs.getLanguage(language)) {
    const { value } = hljs.highlight(code, { language, ignoreIllegals: true });
    return `<pre class="hljs"><code class="language-${escapeHtml(language)}">${value}</code></pre>`;
  }
  // Empty string: markdown-it falls back to its default escaped <pre><code> block.
  return "";
}

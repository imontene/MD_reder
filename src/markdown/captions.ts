import type { MarkdownIt, Token } from "markdown-it";
import type { RenderEnv } from "./env.js";

/** Labels that make a paragraph a table's caption: "**Tabla 1.** …", "**Table 2:** …". */
const TABLE_LABEL = /^(tabla|table|cuadro|tabela|tableau|tabelle)\s+\d+[.:]?$/i;

/** Labels that make a paragraph a diagram's or picture's caption: "**Figura 2.** …". */
const FIGURE_LABEL =
  /^(figura|figure|fig\.|gráfico|gráfica|grafico|grafica|diagrama|diagram|abbildung|abb\.)\s*\d+[.:]?$/i;

/** Class of a caption paragraph left where it was written (next to a lone image). */
export const CAPTION_CLASS = "caption";

/**
 * The inline token of a paragraph that opens with a bold label matching `label`
 * ("**Tabla 1.** Texto"), or undefined.
 */
function captionParagraph(tokens: Token[], i: number, label: RegExp): Token | undefined {
  if (tokens[i]?.type !== "paragraph_open" || tokens[i + 2]?.type !== "paragraph_close") {
    return undefined;
  }
  const children = (tokens[i + 1]?.children ?? []).filter(
    (child) => !(child.type === "text" && child.content === ""),
  );
  if (children[0]?.type !== "strong_open" || children[2]?.type !== "strong_close") {
    return undefined;
  }
  const text = children[1]?.type === "text" ? children[1].content.trim() : "";
  return label.test(text) ? tokens[i + 1] : undefined;
}

const isMermaid = (token: Token | undefined) =>
  token?.type === "fence" && token.info.trim().toLowerCase() === "mermaid";

/** A paragraph holding nothing but one image, starting at `i`. */
function isImageParagraph(tokens: Token[], i: number): boolean {
  if (tokens[i]?.type !== "paragraph_open" || tokens[i + 2]?.type !== "paragraph_close") {
    return false;
  }
  const children = tokens[i + 1]?.children?.filter(
    (child) => !(child.type === "text" && child.content.trim() === ""),
  );
  return children?.length === 1 && children[0]!.type === "image";
}

/** The `table_open` of the table that ends right before `i`, if any. */
function tableEndingAt(tokens: Token[], i: number): Token | undefined {
  if (tokens[i - 1]?.type !== "table_close") return undefined;
  let depth = 0;
  for (let j = i - 1; j >= 0; j--) {
    const type = tokens[j]!.type;
    if (type === "table_close") depth++;
    else if (type === "table_open" && --depth === 0) return tokens[j];
  }
  return undefined;
}

/**
 * With `env.captions` (the academic theme), a paragraph that opens with a bold label is a caption:
 *
 * - "**Tabla 1.** …" right before or after a table becomes its `<caption>`, printed under it;
 * - "**Figura 2.** …" right before or after a Mermaid diagram becomes the diagram's
 *   `<figcaption>`, under it and as wide as it;
 * - "**Figura 2.** …" next to a lone image stays where it is, styled as a caption.
 *
 * The caption keeps its text and label as written: tables and diagrams are not numbered.
 * Runs before `keep_with_heading`, so a diagram keeps its caption when grouped with its heading.
 */
export function captions(md: MarkdownIt): void {
  md.core.ruler.before("keep_with_heading", "captions", (state) => {
    if (!(state.env as RenderEnv).captions) return;
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const table = captionParagraph(tokens, i, TABLE_LABEL);
      if (table) {
        const target =
          tokens[i + 3]?.type === "table_open" ? tokens[i + 3] : tableEndingAt(tokens, i);
        if (target && !target.meta?.caption) {
          target.meta = { ...target.meta, caption: table };
          tokens.splice(i, 3);
          i--;
        }
        continue;
      }
      const figure = captionParagraph(tokens, i, FIGURE_LABEL);
      if (!figure) continue;
      const diagram = isMermaid(tokens[i + 3])
        ? tokens[i + 3]
        : isMermaid(tokens[i - 1])
          ? tokens[i - 1]
          : undefined;
      if (diagram && !diagram.meta?.caption) {
        diagram.meta = { ...diagram.meta, caption: figure };
        tokens.splice(i, 3);
        i--;
      } else if (isImageParagraph(tokens, i + 3) || isImageParagraph(tokens, i - 3)) {
        tokens[i]!.attrJoin("class", CAPTION_CLASS);
      }
    }
  });

  md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    const caption = tokens[idx]!.meta?.caption as Token | undefined;
    const open = self.renderToken(tokens, idx, options);
    if (!caption) return open;
    return `${open}<caption>${self.renderInline(caption.children ?? [], options, env)}</caption>\n`;
  };
}

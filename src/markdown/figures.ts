import type { MarkdownIt, Token } from "markdown-it";
import type { RenderEnv } from "./env.js";

/** Fragment that sets a figure across the full page width: `![…](plot.png#wide)`. */
const WIDE = /#wide$/i;

/** The image of a paragraph holding nothing but one image (`![caption](img.png)`). */
function loneImage(tokens: Token[], i: number): Token | undefined {
  if (tokens[i]?.type !== "paragraph_open" || tokens[i + 2]?.type !== "paragraph_close") {
    return undefined;
  }
  const children = tokens[i + 1]?.children?.filter(
    (child) => !(child.type === "text" && child.content.trim() === ""),
  );
  return children?.length === 1 && children[0]!.type === "image" ? children[0] : undefined;
}

/**
 * With `env.figures` (the academic theme), a lone image becomes a numbered figure: its alt text
 * is the caption, printed as "Fig. 1. …" by the theme. A `#wide` fragment on the image makes it
 * span both columns.
 */
export function figures(md: MarkdownIt): void {
  md.core.ruler.push("figures", (state) => {
    if (!(state.env as RenderEnv).figures) return;
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const image = loneImage(tokens, i);
      if (!image) continue;
      const src = String(image.attrGet("src") ?? "");
      const wide = WIDE.test(src);
      if (wide) image.attrSet("src", src.replace(WIDE, ""));
      tokens[i]!.meta = { ...tokens[i]!.meta, figure: { wide } };
      tokens[i + 2]!.meta = { ...tokens[i + 2]!.meta, figure: { image } };
      i += 2;
    }
  });

  const open = md.renderer.rules.paragraph_open;
  const close = md.renderer.rules.paragraph_close;
  md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    const figure = tokens[idx]!.meta?.figure as { wide: boolean } | undefined;
    if (figure) return `<figure class="figure${figure.wide ? " figure-wide" : ""}">\n`;
    return open ? open(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.paragraph_close = (tokens, idx, options, env, self) => {
    const figure = tokens[idx]!.meta?.figure as { image: Token } | undefined;
    if (!figure) {
      return close
        ? close(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options);
    }
    const caption = self.renderInline(figure.image.children ?? [], options, env).trim();
    return `${caption ? `\n<figcaption>${caption}</figcaption>` : ""}\n</figure>\n`;
  };
}

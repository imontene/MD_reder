// markdown-it-footnote ships no types; @types/markdown-it-footnote depends on the outdated
// @types/markdown-it, which conflicts with the types bundled in markdown-it 15.
declare module "markdown-it-footnote" {
  import type { MarkdownIt } from "markdown-it";

  const footnote: (md: MarkdownIt) => void;
  export default footnote;
}

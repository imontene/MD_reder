import type { MarkdownIt } from "markdown-it";

const TASK_MARKER = /^\[([ xX])\](?:[ \u00a0]|$)/;

/**
 * GFM task lists: `- [ ] todo` / `- [x] done` become disabled checkboxes.
 * Adds `task-list-item` to the <li> and `contains-task-list` to the parent list, like GitHub.
 */
export function taskLists(md: MarkdownIt): void {
  md.core.ruler.after("inline", "task_lists", (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i]!;
      const item = tokens[i - 2]!;
      if (
        inline.type !== "inline" ||
        tokens[i - 1]!.type !== "paragraph_open" ||
        item.type !== "list_item_open"
      ) {
        continue;
      }
      const first = inline.children?.[0];
      const match = first?.type === "text" ? TASK_MARKER.exec(first.content) : null;
      if (!first || !match) continue;

      first.content = first.content.slice(match[0].length);
      const checkbox = new state.Token("html_inline", "", 0);
      const checked = match[1] === " " ? "" : " checked";
      checkbox.content = `<input type="checkbox" class="task-list-item-checkbox" disabled${checked}> `;
      inline.children!.unshift(checkbox);
      item.attrJoin("class", "task-list-item");

      for (let j = i - 3; j >= 0; j--) {
        const list = tokens[j]!;
        const isList = list.type === "bullet_list_open" || list.type === "ordered_list_open";
        if (isList && list.level === item.level - 1) {
          if (!String(list.attrGet("class") ?? "").includes("contains-task-list")) {
            list.attrJoin("class", "contains-task-list");
          }
          break;
        }
      }
    }
  });
}

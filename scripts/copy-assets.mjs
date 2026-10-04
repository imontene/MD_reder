// Copy non-TypeScript assets (CSS, templates) from src/ to dist/ after `tsc`.
import { cpSync } from "node:fs";

cpSync(new URL("../src/assets", import.meta.url), new URL("../dist/assets", import.meta.url), {
  recursive: true,
});

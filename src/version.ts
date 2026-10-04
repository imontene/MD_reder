import { readFileSync } from "node:fs";

// package.json sits one level above both src/ (dev) and dist/ (build).
const pkgUrl = new URL("../package.json", import.meta.url);

export const version: string = (JSON.parse(readFileSync(pkgUrl, "utf8")) as { version: string })
  .version;

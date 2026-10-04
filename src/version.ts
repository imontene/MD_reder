import { PACKAGE_JSON, readTextAsset } from "./assets.js";

export const version: string = (JSON.parse(readTextAsset(PACKAGE_JSON)) as { version: string })
  .version;

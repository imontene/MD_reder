import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG_FILE, findConfigFile, loadConfig } from "../src/config.js";
import { tempDir } from "./helpers.js";

describe("config file", () => {
  it("is found in the start directory or the nearest parent", () => {
    const root = tempDir();
    const nested = path.join(root, "a", "b");
    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(root, CONFIG_FILE), "{}");
    expect(findConfigFile(nested)).toBe(path.join(root, CONFIG_FILE));

    writeFileSync(path.join(nested, CONFIG_FILE), "{}");
    expect(findConfigFile(nested)).toBe(path.join(nested, CONFIG_FILE));
  });

  it("is validated, with CSS paths relative to the config file", () => {
    const dir = tempDir();
    const file = path.join(dir, CONFIG_FILE);
    writeFileSync(file, JSON.stringify({ pageSize: "Letter", css: "temas/propio.css" }));
    expect(loadConfig(file)).toEqual({
      pageSize: "Letter",
      css: [path.join(dir, "temas", "propio.css")],
    });
  });

  it("reports invalid JSON and invalid values with the file name", () => {
    const dir = tempDir();
    const broken = path.join(dir, "roto.json");
    writeFileSync(broken, "{ pageSize: A4 }");
    expect(() => loadConfig(broken)).toThrow(/roto\.json: /);

    const invalid = path.join(dir, "malo.json");
    writeFileSync(invalid, JSON.stringify({ margin: "mucho" }));
    expect(() => loadConfig(invalid)).toThrow(/malo\.json: "margin": invalid margin/);

    const array = path.join(dir, "lista.json");
    writeFileSync(array, "[]");
    expect(() => loadConfig(array)).toThrow(/must be a JSON object/);
  });
});

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RenderError } from "../src/errors.js";
import { writeFileAtomic } from "../src/write.js";
import { tempDir } from "./helpers.js";

describe("writeFileAtomic", () => {
  it("creates folders, replaces existing files and leaves no temporary files", async () => {
    const dir = tempDir();
    const file = path.join(dir, "nueva", "salida.pdf");
    await writeFileAtomic(file, "uno");
    await writeFileAtomic(file, new Uint8Array([100, 111, 115])); // "dos"
    expect(readFileSync(file, "utf8")).toBe("dos");
    expect(readdirSync(path.dirname(file))).toEqual(["salida.pdf"]);
  });

  it("reports failures clearly and cleans up its temporary file", async () => {
    const dir = tempDir();
    // A folder where the file should go cannot be replaced by a file.
    const target = path.join(dir, "ocupado.pdf");
    mkdirSync(target);
    writeFileSync(path.join(target, "dentro.txt"), "intacto");

    await expect(writeFileAtomic(target, "x")).rejects.toThrow(RenderError);
    await expect(writeFileAtomic(target, "x")).rejects.toThrow(/cannot write .*ocupado\.pdf/);
    expect(readdirSync(dir)).toEqual(["ocupado.pdf"]);
    expect(readFileSync(path.join(target, "dentro.txt"), "utf8")).toBe("intacto");
  });
});

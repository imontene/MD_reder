import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { RenderError } from "./errors.js";

const BUSY = new Set(["EPERM", "EBUSY", "EACCES"]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Write a file all at once: the content goes to a hidden temporary file in the same folder,
 * which then replaces the target. An interrupted or failed conversion never leaves a truncated
 * file and keeps the previous version.
 *
 * On Windows a file open in another program (a PDF viewer) cannot be replaced; short-lived locks
 * (antivirus, indexing) are retried before reporting it.
 */
export async function writeFileAtomic(file: string, data: string | Uint8Array): Promise<void> {
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(file)}.${randomBytes(6).toString("hex")}.tmp`);

  try {
    await writeFile(temp, data);
    for (let attempt = 1; ; attempt++) {
      try {
        await rename(temp, file);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? "";
        if (!BUSY.has(code) || attempt >= 5) throw error;
        await sleep(100 * attempt);
      }
    }
  } catch (error) {
    await rm(temp, { force: true });
    const code = (error as NodeJS.ErrnoException).code ?? "";
    const hint = BUSY.has(code) ? " (is it open in another program, such as a PDF viewer?)" : "";
    throw new RenderError(`cannot write ${file}: ${(error as Error).message}${hint}`);
  }
}

#!/usr/bin/env node
// Entry point of the `mdrender` command (npm bin and standalone executable).
import { defaultIo, main } from "./cli.js";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

main(process.argv.slice(2), defaultIo, { signal: controller.signal }).then(
  (code) => {
    process.exitCode = code;
    // Leftover handles (e.g. a keep-alive proxy connection after `setup`) must not keep the CLI
    // running. The timer is unref'd: it only fires if something else holds the process open.
    setTimeout(() => process.exit(), 500).unref();
  },
  (error: unknown) => {
    console.error(error);
    process.exit(70);
  },
);

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { ExitCode } from "../src/exit-codes.js";
import { tempDir } from "./helpers.js";

function capture() {
  const io = { out: "", err: "" };
  return {
    io,
    sink: { out: (t: string) => void (io.out += t), err: (t: string) => void (io.err += t) },
  };
}

async function waitFor(check: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function project(): string {
  const root = tempDir();
  mkdirSync(path.join(root, "docs", "sub"), { recursive: true });
  writeFileSync(path.join(root, "docs", "uno.md"), "# Uno\n\nPrimero.\n");
  writeFileSync(path.join(root, "docs", "sub", "dos.md"), "# Dos\n\n> [!NOTE]\n> Segundo.\n");
  return root;
}

describe("batch conversion", () => {
  it("converts a folder into an output folder, keeping its structure", async () => {
    const root = project();
    const out = path.join(root, "out");
    const { io, sink } = capture();
    const code = await main([path.join(root, "docs"), "-f", "html", "-o", out], sink);

    expect(code).toBe(ExitCode.Ok);
    expect(io.out.trim().split("\n")).toEqual([
      path.join(out, "sub", "dos.html"),
      path.join(out, "uno.html"),
    ]);
    expect(io.err).toContain("2 files, 2 ok, 0 with errors");
    expect(readFileSync(path.join(out, "sub", "dos.html"), "utf8")).toContain(">Nota</p>");
  });

  it("expands globs and keeps going after a failing file", async () => {
    const root = project();
    writeFileSync(path.join(root, "docs", "roto.md"), "Mal: $\\frac{1}{$\n");
    const { io, sink } = capture();
    const code = await main([path.join(root, "docs", "*.md"), "-f", "html"], sink);

    expect(code).toBe(ExitCode.Render);
    expect(existsSync(path.join(root, "docs", "uno.html"))).toBe(true);
    expect(existsSync(path.join(root, "docs", "roto.html"))).toBe(true);
    expect(existsSync(path.join(root, "docs", "sub", "dos.html"))).toBe(false);
    expect(io.err).toMatch(/error: .*roto\.md:1: LaTeX/);
    expect(io.err).toContain("2 files, 1 ok, 1 with errors");
  });

  it("requires an output folder for several inputs", async () => {
    const root = project();
    const { io, sink } = capture();
    const code = await main([path.join(root, "docs"), "-f", "html", "-o", "x.html"], sink);
    expect(code).toBe(ExitCode.Usage);
    expect(io.err).toContain("--output must be a folder");
  });
});

describe("--quiet and --verbose", () => {
  it("--quiet prints only problems; --verbose adds config and timings", async () => {
    const root = project();
    writeFileSync(path.join(root, "mdrender.config.json"), "{}");
    const docs = path.join(root, "docs");

    const quiet = capture();
    expect(await main([docs, "-f", "html", "-q"], quiet.sink)).toBe(ExitCode.Ok);
    expect(quiet.io).toEqual({ out: "", err: "" });

    const verbose = capture();
    expect(await main([docs, "-f", "html", "--verbose"], verbose.sink)).toBe(ExitCode.Ok);
    expect(verbose.io.err).toContain(`config: ${path.join(root, "mdrender.config.json")}`);
    expect(verbose.io.err).toMatch(/uno\.md: \d+ ms/);
  });
});

describe("themes", () => {
  it("adds the dark stylesheet and accepts a custom theme file", async () => {
    const root = project();
    const input = path.join(root, "docs", "uno.md");
    const { sink } = capture();

    expect(await main([input, "-f", "html", "--theme", "dark"], sink)).toBe(ExitCode.Ok);
    let html = readFileSync(path.join(root, "docs", "uno.html"), "utf8");
    expect(html).toContain("--color-bg: #0d1117;");
    expect(html).toContain("@page {\n  background: #0d1117;");

    const custom = path.join(root, "propio.css");
    writeFileSync(custom, "body { color: rebeccapurple; }");
    expect(await main([input, "-f", "html", "--theme", custom], sink)).toBe(ExitCode.Ok);
    html = readFileSync(path.join(root, "docs", "uno.html"), "utf8");
    expect(html).toContain("rebeccapurple");
    expect(html).not.toContain("--color-text:"); // the built-in theme is replaced
  });

  it("rejects unknown themes", async () => {
    const root = project();
    const { io, sink } = capture();
    const args = [path.join(root, "docs", "uno.md"), "-f", "html", "--theme", "sepia"];
    expect(await main(args, sink)).toBe(ExitCode.Usage);
    expect(io.err).toContain("--theme must be light, dark or a .css file");
  });
});

describe("--watch", () => {
  it("converts again when a file changes and stops on abort", async () => {
    const root = project();
    const input = path.join(root, "docs", "uno.md");
    const output = path.join(root, "docs", "uno.html");
    const controller = new AbortController();
    const { io, sink } = capture();

    const running = main([input, "-f", "html", "--watch"], sink, { signal: controller.signal });
    await waitFor(() => io.err.includes("Watching for changes"), "the first conversion");
    expect(readFileSync(output, "utf8")).toContain("Primero.");

    writeFileSync(input, "# Uno\n\nCambiado.\n");
    await waitFor(() => readFileSync(output, "utf8").includes("Cambiado."), "the re-render");

    controller.abort();
    expect(await running).toBe(ExitCode.Ok);
  });

  it("picks up new files in a watched folder", async () => {
    const root = project();
    const controller = new AbortController();
    const { io, sink } = capture();
    const args = [path.join(root, "docs"), "-f", "html", "--watch"];

    const running = main(args, sink, { signal: controller.signal });
    await waitFor(() => io.err.includes("Watching for changes"), "the first conversion");

    writeFileSync(path.join(root, "docs", "nuevo.md"), "# Nuevo\n");
    await waitFor(() => existsSync(path.join(root, "docs", "nuevo.html")), "the new file");

    controller.abort();
    expect(await running).toBe(ExitCode.Ok);
  });
});

describe("preview", () => {
  it("serves a live HTML preview that reloads on changes", async () => {
    const root = project();
    const input = path.join(root, "docs", "uno.md");
    const controller = new AbortController();
    const { io, sink } = capture();

    const running = main(["preview", input, "--no-open"], sink, { signal: controller.signal });
    await waitFor(() => io.out.includes("http://127.0.0.1:"), "the preview URL");
    const url = io.out.trim();

    const page = await (await fetch(url)).text();
    expect(page).toContain("<title>Uno</title>");
    expect(page).toContain('new EventSource("/events")');

    const events = await fetch(new URL("/events", url));
    const reader = events.body!.getReader();
    let received = "";
    const reload = (async () => {
      while (!received.includes("event: reload")) {
        const { value, done } = await reader.read();
        if (done) break;
        received += new TextDecoder().decode(value);
      }
    })();

    writeFileSync(input, "# Uno\n\nNuevo contenido.\n");
    await reload;
    expect(await (await fetch(url)).text()).toContain("Nuevo contenido.");
    expect((await fetch(new URL("/otra", url))).status).toBe(404);

    await reader.cancel();
    controller.abort();
    expect(await running).toBe(ExitCode.Ok);
  });

  it("validates the port", async () => {
    const { io, sink } = capture();
    const root = project();
    const args = ["preview", path.join(root, "docs", "uno.md"), "--port", "x", "--no-open"];
    expect(await main(args, sink)).toBe(ExitCode.Usage);
    expect(io.err).toContain("invalid port");
  });
});

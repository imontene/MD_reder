import { spawn } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { watch } from "chokidar";
import { BrowserPool, renderDocument, type RenderSettings } from "./convert.js";
import { formatDiagnostic } from "./diagnostics.js";
import { ExitCode } from "./exit-codes.js";
import { escapeHtml } from "./html.js";
import { displayPath, type Io } from "./run.js";

export interface PreviewOptions {
  input: string;
  settings: RenderSettings;
  io: Io;
  /** The preview stops when this signal aborts (Ctrl+C in the CLI). */
  signal: AbortSignal;
  /** Port to listen on; 0 picks a free one. */
  port?: number;
  /** Open the default browser on the preview URL. */
  open?: boolean;
  debounceMs?: number;
}

/** Reloads the page when the server announces a new render (Server-Sent Events). */
const LIVE_RELOAD = `<script>
new EventSource("/events").addEventListener("reload", () => location.reload());
</script>`;

function errorPage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>mdrender</title></head>
<body style="font-family: system-ui, sans-serif; padding: 2rem; color: #b42318;">
<h1>mdrender</h1><pre style="white-space: pre-wrap;">${escapeHtml(message)}</pre>
</body></html>`;
}

/** Open a URL with the system's default browser. */
export function openInBrowser(url: string): void {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => undefined);
  child.unref();
}

/**
 * Serve a live HTML preview of a Markdown file on localhost and reload it on every change to
 * the file, its config file or its stylesheets.
 */
export async function preview(options: PreviewOptions): Promise<ExitCode> {
  const { settings, io, signal } = options;
  const input = path.resolve(options.input);
  const browsers = new BrowserPool(settings.browser);
  const clients = new Set<ServerResponse>();
  let page = errorPage("Rendering…");
  let dependencies: string[] = [];

  const render = async () => {
    try {
      const doc = await renderDocument(input, settings, browsers);
      for (const diagnostic of doc.diagnostics) {
        io.err(`${formatDiagnostic(diagnostic, displayPath(input))}\n`);
      }
      page = doc.html.replace(/<\/body>\s*<\/html>\s*$/, `${LIVE_RELOAD}\n</body>\n</html>\n`);
      dependencies = doc.dependencies;
    } catch (error) {
      // Keep serving: show the problem in the page and retry on the next change.
      const message = error instanceof Error ? error.message : String(error);
      io.err(`error: ${message}\n`);
      page = errorPage(message).replace("</body>", `${LIVE_RELOAD}</body>`);
    }
    for (const client of clients) client.write("event: reload\ndata: \n\n");
  };

  await render();

  const server = createServer((request, response) => {
    if (request.url === "/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      response.write(": connected\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (request.url === "/" || request.url?.startsWith("/?")) {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(page);
      return;
    }
    response.writeHead(404).end();
  });

  // Only reachable from this machine.
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/`;
  io.out(`${url}\n`);
  io.err(`Preview of ${displayPath(input)} at ${url} (Ctrl+C to stop)\n`);
  if (options.open) openInBrowser(url);

  const watcher = watch([input, ...dependencies], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
  });
  let timer: NodeJS.Timeout | undefined;
  let running = Promise.resolve();
  watcher.on("all", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      running = running.then(async () => {
        const before = new Set(dependencies);
        await render();
        watcher.add(dependencies.filter((dep) => !before.has(dep)));
      });
    }, options.debounceMs ?? 150);
  });

  await new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener("abort", () => resolve(), { once: true });
  });

  clearTimeout(timer);
  await running.catch(() => undefined);
  await watcher.close();
  for (const client of clients) client.end();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await browsers.close();
  return ExitCode.Ok;
}

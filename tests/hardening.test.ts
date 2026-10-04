import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { convertFile } from "../src/convert.js";
import { ExitCode } from "../src/exit-codes.js";
import { browserRequired, fixture, tempDir, testBrowser } from "./helpers.js";

const browser = testBrowser();
const withBrowser = describe.skipIf(!browser && !browserRequired);

async function pdfInfo(file: string): Promise<{ pages: number; text: string }> {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)) });
  const doc = await task.promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + " ";
  }
  const pages = doc.numPages;
  await task.destroy();
  return { pages, text: text.replace(/\s+/g, " ") };
}

/** A document in "carpeta con espacios/ñandú/acción y reacción.md" with accented image names. */
function unicodeProject(): string {
  const dir = path.join(tempDir(), "carpeta con espacios", "ñandú");
  mkdirSync(path.join(dir, "imágenes"), { recursive: true });
  copyFileSync(fixture("img/gradiente.png"), path.join(dir, "imágenes", "logo ñ.png"));
  const input = path.join(dir, "acción y reacción.md");
  writeFileSync(
    input,
    [
      "# Acción y reacción",
      "",
      "Pingüino, ñandú, çedilla, ü — «comillas» y emoji ✓.",
      "",
      "![Markdown](imágenes/logo%20ñ.png)",
      "",
      '<p><img src="imágenes/logo ñ.png" width="80" alt="HTML"></p>',
      "",
    ].join("\n"),
  );
  return input;
}

describe("paths with spaces and accents", () => {
  it("converts files and embeds images whose names have spaces and accents", async () => {
    const input = unicodeProject();
    const err: string[] = [];
    const code = await main([input, "-f", "html"], {
      out: () => undefined,
      err: (t) => void err.push(t),
    });
    expect(err.join("")).toBe("");
    expect(code).toBe(ExitCode.Ok);

    const html = readFileSync(input.replace(/\.md$/, ".html"), "utf8");
    expect(html.match(/src="data:image\/png;base64,/g)).toHaveLength(2);
    expect(html).toContain('width="80"');
    expect(html).toContain("<title>Acción y reacción</title>");
  });

  it.skipIf(process.platform !== "win32")("accepts Windows UNC paths", async () => {
    const input = unicodeProject();
    // \\localhost\C$\... reaches the same file through the administrative share.
    const unc = `\\\\localhost\\${input[0]}$${input.slice(2)}`;
    if (!existsSync(unc)) return; // administrative shares disabled on this machine
    const output = path.join(tempDir(), "unc.html");
    const result = await convertFile({ input: unc, output, format: "html" });
    expect(result.diagnostics).toEqual([]);
    expect(readFileSync(output, "utf8")).toContain("data:image/png;base64,");
  });
});

withBrowser("PDF hardening", () => {
  it("renders accented text from accented paths", async () => {
    const input = unicodeProject();
    const output = path.join(path.dirname(input), "salida con espacios", "ñ.pdf");
    const result = await convertFile({ input, output, format: "pdf" });
    expect(result.diagnostics).toEqual([]);
    const { text } = await pdfInfo(output);
    expect(text).toContain("Pingüino, ñandú, çedilla, ü");
  });

  it("never runs scripts from the Markdown", async () => {
    const dir = tempDir();
    const input = path.join(dir, "script.md");
    writeFileSync(
      input,
      "# Seguro\n\nTexto original.\n\n<script>document.body.innerHTML = 'HACKEADO';</script>\n\n" +
        '<img src="x" onerror="document.body.innerHTML = \'HACKEADO\'">\n',
    );
    const output = path.join(dir, "script.pdf");
    await convertFile({ input, output, format: "pdf" });
    const { text } = await pdfInfo(output);
    expect(text).toContain("Texto original.");
    expect(text).not.toContain("HACKEADO");
  });

  it("blocks remote and file: resources unless --allow-remote", async () => {
    let hits = 0;
    const png = readFileSync(fixture("img/gradiente.png"));
    const server = createServer((_req, res) => {
      hits++;
      res.writeHead(200, { "Content-Type": "image/png" }).end(png);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/remota.png`;

    try {
      const dir = tempDir();
      const secret = path.join(dir, "secreto.txt");
      writeFileSync(secret, "CONTENIDO SECRETO");
      const input = path.join(dir, "red.md");
      writeFileSync(
        input,
        `# Red\n\n![remota](${url})\n\n<iframe src="file:///${secret.replace(/\\/g, "/")}"></iframe>\n`,
      );

      const blocked = await convertFile({ input, output: path.join(dir, "a.pdf"), format: "pdf" });
      expect(hits).toBe(0);
      const messages = blocked.diagnostics.map((d) => d.message);
      expect(messages).toContain(`resource not loaded: ${url} (use --allow-remote to download it)`);
      // file: URLs never load (Chrome refuses them before they reach the request filter).
      expect((await pdfInfo(path.join(dir, "a.pdf"))).text).not.toContain("SECRETO");

      const allowed = await convertFile({
        input,
        output: path.join(dir, "b.pdf"),
        format: "pdf",
        allowRemote: true,
      });
      expect(hits).toBe(1);
      expect(allowed.diagnostics.map((d) => d.message).some((m) => m.includes(url))).toBe(false);
      // file: stays blocked even with --allow-remote.
      expect((await pdfInfo(path.join(dir, "b.pdf"))).text).not.toContain("SECRETO");
    } finally {
      server.close();
    }
  });

  it("handles a large document: 100+ pages and 50 diagrams", async () => {
    const dir = tempDir();
    const input = path.join(dir, "grande.md");
    const sections: string[] = ["# Documento grande\n"];
    for (let i = 1; i <= 50; i++) {
      sections.push(`## Sección ${i}\n`);
      for (let p = 0; p < 18; p++) {
        sections.push(
          `Párrafo ${p + 1} de la sección ${i}. ` +
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit, con $x_" +
            i +
            " = \\frac{a}{b}$ y texto de relleno para ocupar espacio en la página. ".repeat(4) +
            "\n",
        );
      }
      sections.push(
        "```mermaid\nflowchart LR\n  A" + i + "[Inicio " + i + "] --> B" + i + "[Fin]\n```\n",
      );
    }
    writeFileSync(input, sections.join("\n"));

    const started = Date.now();
    const output = path.join(dir, "grande.pdf");
    const result = await convertFile({ input, output, format: "pdf" });
    const seconds = (Date.now() - started) / 1000;

    expect(result.diagnostics).toEqual([]);
    const { pages, text } = await pdfInfo(output);
    expect(pages).toBeGreaterThanOrEqual(100);
    expect(text).toContain("Inicio 50");
    expect(seconds).toBeLessThan(120);
  }, 180_000);
});

// Builds the blind gallery (§5.4 of docs/ESPECIFICACION_MERMAID_LAYOUT.md) from the candidates
// that docs/prototipos/mermaid_layout/poc.mts writes with --dump:
//   npx tsx docs/prototipos/mermaid_layout/poc.mts --dump
//   npx tsx docs/prototipos/mermaid_layout/poc.mts docs/prototipos/mermaid_layout/casos-reales.md --dump
//   npx tsx docs/prototipos/galeria_ciega/generar.mts
// Writes pagina/ (index.html, pares.json, fuentes.css: what is published) and clave.json (which
// candidate is A and which is B in each pair; kept out of the page so the gallery stays blind).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fontFaceCss } from "../../../src/render/fonts.ts";

const here = dirname(fileURLToPath(import.meta.url));

interface Candidate {
  svg: string;
  label: string;
  scale: number;
  height: number;
}
interface Case {
  title: string;
  candidates: Record<string, Candidate>;
}

/** Below this print scale a candidate is plainly worse (text under ~7 pt): not worth a vote. */
const MIN_SCALE = 0.5;
const SEED = 20261127;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(SEED);
const shuffle = <T,>(items: T[]) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

const dir = join(here, "candidatos");
const cases: (Case & { source: string })[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .flatMap((f) =>
    (JSON.parse(readFileSync(join(dir, f), "utf8")) as Case[]).map((c) => ({ ...c, source: f })),
  );

type Kind = "classic" | "classicAlt" | "smart" | "smartAlt";
const similar = (a: Candidate, b: Candidate) =>
  Math.abs(a.scale - b.scale) < 0.02 && Math.abs(a.height - b.height) < 8;

const raw: { title: string; type: string; x: Kind; y: Kind; c: Case }[] = [];
for (const c of cases) {
  const k = c.candidates;
  if (k.smart) raw.push({ title: c.title, type: "classic-smart", x: "classic", y: "smart", c });
  if (k.classicAlt && k.classicAlt.scale >= MIN_SCALE)
    raw.push({ title: c.title, type: "classic-girado", x: "classic", y: "classicAlt", c });
  if (
    k.smart &&
    k.smartAlt &&
    k.smartAlt.scale >= MIN_SCALE &&
    !similar(k.smartAlt, k.classic!) &&
    !similar(k.smartAlt, k.smart)
  )
    raw.push({ title: c.title, type: "smart-alternativa", x: "smart", y: "smartAlt", c });
}

/** Give a rendered SVG a new root id (its styles and gradients are scoped by it). */
function reid(svg: string, id: string): string {
  const old = /<svg\b[^>]*?\sid="([^"]+)"/.exec(svg)?.[1];
  if (!old) return svg;
  const escaped = old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return svg.replace(new RegExp(`${escaped}(?![0-9])`, "g"), id);
}

const pairs = shuffle(raw).map((p, i) => {
  const id = `p${String(i + 1).padStart(2, "0")}`;
  const swap = random() < 0.5;
  const [a, b] = swap ? [p.y, p.x] : [p.x, p.y];
  return { id, p, a, b };
});

const out = join(here, "pagina");
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "pares.json"),
  "[\n" +
    pairs
      .map(({ id, p, a, b }) =>
        JSON.stringify({
          id,
          titulo: p.title,
          a: reid(p.c.candidates[a]!.svg, `${id}-a`),
          b: reid(p.c.candidates[b]!.svg, `${id}-b`),
        }),
      )
      .join(",\n") +
    "\n]\n",
);
writeFileSync(join(out, "fuentes.css"), fontFaceCss("manrope"));
writeFileSync(join(out, "index.html"), readFileSync(join(here, "plantilla.html"), "utf8"));
const key = pairs.map(({ id, p, a, b }) => ({
  id,
  diagrama: p.title,
  origen: p.c.source,
  tipo: p.type,
  A: { candidato: a, ...strip(p.c.candidates[a]!) },
  B: { candidato: b, ...strip(p.c.candidates[b]!) },
}));
function strip(c: Candidate) {
  return { motor: c.label, escala: Math.round(c.scale * 100) / 100, alto: c.height };
}
writeFileSync(join(here, "clave.json"), JSON.stringify(key, null, 2) + "\n");
const byType = key.reduce<Record<string, number>>(
  (n, k) => ({ ...n, [k.tipo]: (n[k.tipo] ?? 0) + 1 }),
  {},
);
console.log(`${pairs.length} pares`, byType);

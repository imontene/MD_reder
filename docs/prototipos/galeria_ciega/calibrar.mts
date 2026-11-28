// Calibrates the criterion of §5.3 (docs/ESPECIFICACION_MERMAID_LAYOUT.md) on the author's votes
// in the blind gallery. Inputs: clave.json, medidas.json (medidas.mts) and the votes, saved from
// the gallery's database as one JSON file per pair (`votos/<id>.json`), in the folder given as the
// first argument. Writes calibracion.md and criterio.json next to this file.
//   npx tsx docs/prototipos/galeria_ciega/calibrar.mts <carpeta de votos>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Measures } from "./medidas.mts";

const here = dirname(fileURLToPath(import.meta.url));
const votesDir = process.argv[2];
if (!votesDir) throw new Error("usage: calibrar.mts <votes folder>");

const FEATURES = [
  "legibility",
  "economy",
  "proportion",
  "balance",
  "contact",
  "exits",
  "returns",
  "crossings",
] as const;
type Feature = (typeof FEATURES)[number];
const NAMES: Record<Feature, string> = {
  legibility: "Legibilidad",
  economy: "Economía",
  proportion: "Proporción",
  balance: "Equilibrio",
  contact: "Contacto",
  exits: "Salidas limpias",
  returns: "Retornos",
  crossings: "Cruces y quiebres",
};

interface KeyEntry {
  id: string;
  diagrama: string;
  tipo: string;
  A: { candidato: string; escala: number; alto: number };
  B: { candidato: string; escala: number; alto: number };
}
const key = JSON.parse(readFileSync(join(here, "clave.json"), "utf8")) as KeyEntry[];
const measures = JSON.parse(readFileSync(join(here, "medidas.json"), "utf8")) as Record<
  string,
  { A: Measures; B: Measures }
>;
const votes: Record<string, { voto: string | null; motivos?: string[] }> = {};
for (const f of readdirSync(votesDir).filter((f) => f.endsWith(".json")))
  votes[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(votesDir, f), "utf8"));

/** A pair: feature differences A − B and the vote (+1 A, −1 B, 0 equal). */
interface Pair {
  id: string;
  tipo: string;
  diagrama: string;
  x: number[];
  y: number;
  m: { A: Measures; B: Measures };
}
const pairs: Pair[] = key
  .filter((k) => votes[k.id]?.voto)
  .map((k) => {
    const m = measures[k.id]!;
    const v = votes[k.id]!.voto;
    return {
      id: k.id,
      tipo: k.tipo,
      diagrama: k.diagrama,
      m,
      x: FEATURES.map((f) => m.A[f] - m.B[f]),
      y: v === "A" ? 1 : v === "B" ? -1 : 0,
    };
  });
/** Smallest print scale the author accepted in the gallery was 0.54: the hard floor is 0.5. */
const MIN_SCALE = 0.5;
/** Hard conditions of §5.3: a candidate that fails one loses to one that passes them all. */
const fails = (m: Measures) =>
  m.scale < MIN_SCALE || m.looseEnds > 0 || m.edgesThroughBoxes > 0 || m.nodeOverlaps > 0;
/** +1 or −1 when the hard conditions decide the pair, 0 when the score has to. */
const hard = (p: Pair) => (fails(p.m.A) === fails(p.m.B) ? 0 : fails(p.m.A) ? -1 : 1);
const decisive = pairs.filter((p) => p.y !== 0 && hard(p) === 0);

// Standardise each difference by its spread over all pairs.
const spread = FEATURES.map((_, j) => {
  const v = pairs.map((p) => p.x[j]!);
  const mean = v.reduce((s, a) => s + a, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, a) => s + (a - mean) ** 2, 0) / v.length);
  return sd > 1e-9 ? sd : 1;
});
const z = (p: Pair, use: boolean[]) => p.x.map((v, j) => (use[j] ? v / spread[j]! : 0));

/** L2-regularised logistic regression without intercept (the criterion is symmetric in A, B). */
function fit(train: Pair[], use: boolean[], lambda: number): number[] {
  const w = FEATURES.map(() => 0);
  const X = train.map((p) => z(p, use));
  for (let it = 0; it < 3000; it++) {
    const g = w.map((wj) => -lambda * wj);
    X.forEach((x, i) => {
      const yi = train[i]!.y;
      const s = x.reduce((a, v, j) => a + v * w[j]!, 0);
      const p = 1 / (1 + Math.exp(yi * s));
      x.forEach((v, j) => (g[j]! += yi * v * p));
    });
    w.forEach((_, j) => (w[j]! += (0.5 / train.length) * g[j]!));
  }
  return w;
}
const score = (p: Pair, w: number[], use: boolean[]) =>
  z(p, use).reduce((a, v, j) => a + v * w[j]!, 0);

/** Leave-one-out scores: each pair scored by a model fitted without it. */
function looScores(use: boolean[], lambda: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of pairs) {
    const w = fit(
      decisive.filter((q) => q.id !== p.id),
      use,
      lambda,
    );
    out.set(p.id, score(p, w, use));
  }
  return out;
}
const decisiveAccuracy = (s: Map<string, number>) =>
  decisive.filter((p) => Math.sign(s.get(p.id)!) === p.y).length / decisive.length;
/** The criterion's answer: hard conditions first, then the score ("equal" under the margin). */
const predict = (p: Pair, v: number, margin: number) =>
  hard(p) || (Math.abs(v) < margin ? 0 : Math.sign(v));
/** Three-way accuracy over every voted pair. */
const threeWay = (s: Map<string, number>, margin: number) =>
  pairs.filter((p) => predict(p, s.get(p.id)!, margin) === p.y).length / pairs.length;

const ALL = FEATURES.map(() => true);
/** Feature sets fixed beforehand, not selected on the votes (too few for a stable selection). */
const VARIANTS: { name: string; use: boolean[] }[] = [
  { name: "todas las medidas", use: ALL },
  {
    name: "las de los motivos del autor (economía, legibilidad, equilibrio, retornos)",
    use: FEATURES.map((f) => ["economy", "legibility", "balance", "returns"].includes(f)),
  },
  { name: "solo economía", use: FEATURES.map((f) => f === "economy") },
];
const lambdas = [0.03, 0.1, 0.3, 1, 3];
const margins = [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1];
const results = VARIANTS.map((v) => {
  const byLambda = lambdas.map((l) => ({ l, s: looScores(v.use, l) }));
  const bestL = byLambda.reduce((a, b) =>
    decisiveAccuracy(b.s) > decisiveAccuracy(a.s) + 1e-9 ? b : a,
  );
  const m = margins.reduce((a, b) => (threeWay(bestL.s, b) > threeWay(bestL.s, a) + 1e-9 ? b : a));
  return { ...v, lambda: bestL.l, loo: bestL.s, margin: m, acc: threeWay(bestL.s, m) };
});
const chosen = results.reduce((a, b) => (b.acc > a.acc + 1e-9 ? b : a));

/**
 * Stepped rule: hard conditions; then the more compact one wins if the printed heights differ by
 * more than `e` of the page; then the better centred one if balance differs by more than `b`;
 * else equal. Both thresholds chosen with each pair left out.
 */
const E = [0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3];
const Bs = [0, 0.02, 0.05, 0.1, 0.2];
const stepped = (p: Pair, e: number, b: number) => {
  if (hard(p)) return hard(p);
  const de = p.m.A.economy - p.m.B.economy;
  if (Math.abs(de) > e) return Math.sign(de);
  const db = p.m.A.balance - p.m.B.balance;
  return Math.abs(db) > b ? Math.sign(db) : 0;
};
const bestThresholds = (train: Pair[]) => {
  let best = { e: 0, b: 0, acc: -1 };
  for (const e of E)
    for (const b of Bs) {
      const acc = train.filter((p) => stepped(p, e, b) === p.y).length / train.length;
      if (acc > best.acc + 1e-9) best = { e, b, acc };
    }
  return best;
};
const steppedLoo =
  pairs.filter((p) => {
    const t = bestThresholds(pairs.filter((q) => q.id !== p.id));
    return stepped(p, t.e, t.b) === p.y;
  }).length / pairs.length;
const steppedAll = bestThresholds(pairs);
const steppedMisses = pairs.filter((p) => stepped(p, steppedAll.e, steppedAll.b) !== p.y);
const { use, lambda, loo, margin } = chosen;
const dropped: string[] = [];
const byLambda = lambdas.map((l) => ({ l, acc: decisiveAccuracy(looScores(use, l)) }));
const hardDecided = pairs.filter((p) => hard(p) !== 0);
const hardRight = hardDecided.filter((p) => hard(p) === p.y).length;

// The 25 % hold-out of §5.4 (fixed, seeded), as a second check.
let seed = 20261128;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const order = [...pairs].sort(() => rand() - 0.5);
const held = new Set(order.slice(0, Math.round(pairs.length / 4)).map((p) => p.id));
const wHold = fit(
  decisive.filter((p) => !held.has(p.id)),
  use,
  lambda,
);
const heldPairs = pairs.filter((p) => held.has(p.id));
const heldAcc =
  heldPairs.filter((p) => {
    return predict(p, score(p, wHold, use), margin) === p.y;
  }).length / heldPairs.length;

// Reference rules
const rule = (pick: (p: Pair) => number) =>
  pairs.filter((p) => pick(p) === p.y).length / pairs.length;
const larger = (a: number, b: number, tol: number) => (Math.abs(a - b) <= tol ? 0 : a > b ? 1 : -1);
const refScale = rule((p) => larger(p.m.A.scale, p.m.B.scale, 0.02));
const refShort = rule((p) => larger(-p.m.A.printedHeight, -p.m.B.printedHeight, 8));
const classicSmart = pairs.filter((p) => p.tipo === "classic-smart");
const refClassic =
  classicSmart.filter((p) => {
    const k = key.find((k) => k.id === p.id)!;
    return (k.A.candidato === "classic" ? 1 : -1) === p.y;
  }).length / classicSmart.length;
const equalW = FEATURES.map(() => 1);
const eqScores = new Map(pairs.map((p) => [p.id, score(p, equalW, ALL)]));
const refEqual = Math.max(...margins.map((m) => threeWay(eqScores, m)));
const refHardClassic =
  classicSmart.filter((p) => {
    const k = key.find((k) => k.id === p.id)!;
    return (hard(p) || (k.A.candidato === "classic" ? 1 : -1)) === p.y;
  }).length / classicSmart.length;

// Final weights, fitted on every decisive vote; in raw units for Q(c) = Σ wᵢ·mᵢ(c).
const wStd = fit(decisive, use, lambda);
const wRaw = wStd.map((w, j) => (use[j] ? w / spread[j]! : 0));
const pct = (v: number) => `${Math.round(v * 100)} %`;
const misses = pairs.filter((p) => predict(p, loo.get(p.id)!, margin) !== p.y);

writeFileSync(
  join(here, "criterio.json"),
  JSON.stringify(
    {
      fecha: new Date().toISOString().slice(0, 10),
      votos: pairs.length,
      regla: "escalonada",
      escala_minima: MIN_SCALE,
      umbral_economia: steppedAll.e,
      umbral_equilibrio: steppedAll.b,
      coincidencia_dejando_fuera: Number(steppedLoo.toFixed(3)),
      modelo_de_pesos: {
        variante: chosen.name,
        lambda,
        margen: margin,
        coincidencia_dejando_fuera: Number(threeWay(loo, margin).toFixed(3)),
        pesos: Object.fromEntries(
          FEATURES.map((f, j) => [f, use[j] ? Number(wRaw[j]!.toFixed(4)) : null]),
        ),
      },
    },
    null,
    2,
  ) + "\n",
);

const md = [
  "# Calibración del criterio (§5.3–§5.4)",
  "",
  `Generado por \`calibrar.mts\` con ${pairs.length} votos (${pairs.filter((p) => p.y !== 0).length} con preferencia, ${pairs.filter((p) => p.y === 0).length} «iguales»).`,
  "",
  "## Coincidencia con el autor",
  "",
  `Condiciones obligatorias (letra ≥ ${MIN_SCALE}, flechas que tocan su forma, ninguna arista a través de una caja, sin solapes): deciden ${hardDecided.length} pares y aciertan en ${hardRight}.`,
  "",
  "| Conjunto de medidas (después de las condiciones obligatorias) | λ | Margen | Coincidencia, dejando cada par fuera |",
  "| --- | --- | --- | --- |",
  ...results.map(
    (r) =>
      `| ${r === chosen ? "**" + r.name + "**" : r.name} | ${r.lambda} | ${r.margin} | ${pct(r.acc)} |`,
  ),
  "",
  `**Regla escalonada** (condiciones obligatorias; luego el más compacto si los altos impresos difieren en más de ${steppedAll.e} de la página; luego el mejor centrado si el equilibrio difiere en más de ${steppedAll.b}; si no, iguales): **${pct(steppedLoo)}** dejando cada par fuera, también al elegir los dos umbrales (${pct(steppedAll.acc)} con todos los pares).`,
  "",
  "| Criterio | Coincidencia |",
  "| --- | --- |",
  `| **Calibrado**, dejando cada par fuera al ajustar (tres opciones: A, B, iguales) | **${pct(threeWay(loo, margin))}** |`,
  `| Calibrado, solo pares con preferencia, dejando cada par fuera | ${pct(decisiveAccuracy(loo))} |`,
  `| Calibrado, 25 % de pares reservados (${heldPairs.length} pares) | ${pct(heldAcc)} |`,
  `| Referencia: gana la letra más grande (el piso anterior) | ${pct(refScale)} |`,
  `| Referencia: gana el más bajo | ${pct(refShort)} |`,
  `| Referencia: pesos iguales, mejor margen | ${pct(refEqual)} |`,
  `| Referencia: siempre \`classic\` (solo pares \`classic\`–\`smart\`) | ${pct(refClassic)} |`,
  `| Referencia: condiciones obligatorias y, si no deciden, \`classic\` (solo pares \`classic\`–\`smart\`) | ${pct(refHardClassic)} |`,
  "",
  "## Pesos",
  "",
  `Regularización λ = ${lambda} (elegida dejando cada par fuera: ${byLambda.map((b) => `${b.l} → ${pct(b.acc)}`).join(", ")}). Margen para «iguales»: ${margin} en la escala estandarizada.`,
  "",
  `Conjunto elegido: ${chosen.name}.`,
  "",
  "| Medida | Usada | Peso (unidades de la medida) | Peso estandarizado |",
  "| --- | --- | --- | --- |",
  ...FEATURES.map(
    (f, j) =>
      `| ${NAMES[f]} | ${use[j] ? "sí" : "no"} | ${use[j] ? wRaw[j]!.toFixed(3) : "—"} | ${use[j] ? wStd[j]!.toFixed(2) : "—"} |`,
  ),
  "",
  dropped.length
    ? `Medidas quitadas porque no mejoran la coincidencia: ${dropped.join("; ")}.`
    : "No se quitó ninguna medida.",
  "",
  "## Pares en que la regla escalonada no coincide",
  "",
  "| Par | Tipo | Diagrama | Voto | Regla |",
  "| --- | --- | --- | --- | --- |",
  ...steppedMisses.map((p) => {
    const k = key.find((k) => k.id === p.id)!;
    const name = (y: number) => (y === 1 ? k.A.candidato : y === -1 ? k.B.candidato : "iguales");
    return `| ${p.id} | ${p.tipo} | ${p.diagrama} | ${name(p.y)} | ${name(stepped(p, steppedAll.e, steppedAll.b))} |`;
  }),
  "",
  "## Pares en que el modelo de pesos no coincide",
  "",
  "| Par | Tipo | Diagrama | Voto | Puntuación |",
  "| --- | --- | --- | --- | --- |",
  ...misses.map((p) => {
    const k = key.find((k) => k.id === p.id)!;
    const vote = p.y === 1 ? k.A.candidato : p.y === -1 ? k.B.candidato : "iguales";
    return `| ${p.id} | ${p.tipo} | ${p.diagrama} | ${vote} | ${loo.get(p.id)!.toFixed(2)} |`;
  }),
  "",
];
writeFileSync(join(here, "calibracion.md"), md.join("\n"));
console.log(md.join("\n"));

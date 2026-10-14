import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { inventory } from "./lib/corpus-audit.mjs";
const inputs = [];
let output;
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i],
    value = process.argv[i + 1];
  if (key === "--source" && value) inputs.push(value);
  else if (key === "--out" && value) output = path.resolve(value);
  else
    throw new Error(
      "Usage: node scripts/audit-cad-corpus.mjs --source folder-or-dwg [--source ...] --out .data/corpus/run-unique",
    );
}
if (!inputs.length || !output)
  throw new Error(
    "Explicit source(s) and a new private output directory are required.",
  );
const privateRoot = path.resolve(import.meta.dirname, "../.data");
if (!output.startsWith(privateRoot + path.sep))
  throw new Error(
    "Private plans must be written under ignored .data/, never public/ or a tracked folder.",
  );
const files = inventory(inputs);
if (!files.length || files.length > 200)
  throw new Error("Select between 1 and 200 DWG files.");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.mkdirSync(output);
const manifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  purpose: "audit-and-human-annotation-preparation",
  rightsStatus: "owner-to-confirm-training-and-commercial-use",
  sourceGroup: null,
  split: "unassigned",
  files,
};
const indexPath = path.join(output, "inventory.json");
fs.writeFileSync(indexPath, JSON.stringify(manifest, null, 2), { flag: "wx" });
const results = [],
  unique = [...new Map(files.map((f) => [f.hash, f])).values()];
for (const [i, file] of unique.entries()) {
  console.log(`[${i + 1}/${unique.length}] ${file.name}`);
  const worker = spawnSync(
    process.execPath,
    [
      "--max-old-space-size=3072",
      path.join(import.meta.dirname, "audit-cad-file.mjs"),
      indexPath,
      file.hash,
      path.join(output, `${file.hash}.audit.json`),
    ],
    { encoding: "utf8", timeout: 180000, maxBuffer: 256 * 1024 },
  );
  if (worker.status !== 0 || worker.error) {
    results.push({
      file,
      error: worker.error?.message ?? worker.stderr.slice(-1200),
      status: "failed",
    });
    console.log(`FAILED: ${results.at(-1).error}`);
  } else {
    const detail = JSON.parse(
      fs.readFileSync(path.join(output, `${file.hash}.audit.json`), "utf8"),
    );
    delete detail.proposals; // Proposals remain in per-file private audit; summary stays small.
    results.push({ ...detail, status: "audited" });
    console.log(worker.stdout.trim());
  }
}
const summary = {
  ...manifest,
  selectedFiles: files.length,
  uniqueFiles: unique.length,
  results,
  independentlyReviewedFiles: 0,
  trainingReadySamples: 0,
};
fs.writeFileSync(
  path.join(output, "audit.json"),
  JSON.stringify(summary, null, 2),
  { flag: "wx" },
);
const safe = (s) => s.replace(/[|\r\n]/g, " ");
const report = [
  "# Auditoría local del corpus DWG",
  "",
  `Archivos seleccionados: ${files.length}. Contenidos únicos (SHA-256): ${unique.length}.`,
  "",
  "No son anotaciones de referencia. Las clases sugeridas por nombres no han sido revisadas por un arquitecto. No se entrenó ni midió un modelo.",
  "",
  "| Archivo | Disciplina sugerida | Entidades antes → después de XREF | Capas | Referencias pendientes |",
  "|---|---|---:|---:|---|",
  ...results.map(
    (r) =>
      `| ${safe(r.file.name)} | ${r.disciplineHint ?? "error"} | ${r.error ? "FALLO" : `${r.beforeEntities} → ${r.afterEntities}`} | ${r.layers?.length ?? "—"} | ${safe(r.references?.unresolved.join(", ") || r.error || "ninguna detectada")} |`,
  ),
  "",
  "## Condiciones antes del entrenamiento",
  "",
  "1. Confirmar derechos de uso y agrupación por edificio. Plantas, cortes, detalles, revisiones y disciplinas del mismo edificio deben permanecer en el mismo split.",
  "2. Revisar unidades con una cota real; INSUNITS es evidencia declarada, no calibración validada.",
  "3. Delimitar cada vista y distinguir planta, corte, elevación, detalle, leyenda y tabla. No extruir toda la lámina.",
  "4. Anotar objetos completos, muros por polígonos/ejes y tuberías por trazados/redes; revisar símbolos contra sus leyendas.",
  "5. Corregir propuestas y completar las omisiones en cada recorte. Identificar anotador y revisor independientes.",
  "6. Incorporar otros edificios antes de separar entrenamiento, validación y prueba. Treinta archivos del mismo edificio no equivalen a treinta edificios independientes.",
  "7. Evaluar el detector congelado contra las anotaciones independientes, sin editar sus predicciones para fabricar exactitud.",
  "",
  "Los JSON vectoriales y fuentes se conservan únicamente en .data/ (ignorado por Git).",
  "",
];
fs.writeFileSync(path.join(output, "INFORME.md"), report.join("\n"), {
  flag: "wx",
});
const unitCounts = {},
  skipped = {},
  hintCounts = new Map();
for (const r of results.filter((r) => r.status === "audited")) {
  const unit = r.header.units.declared;
  unitCounts[unit] = (unitCounts[unit] ?? 0) + 1;
  for (const [kind, count] of Object.entries(r.skipped))
    skipped[kind] = (skipped[kind] ?? 0) + count;
  for (const layer of r.layers)
    if (layer.classHint) {
      const entry = hintCounts.get(layer.classHint) ?? {
        files: new Set(),
        layers: 0,
        primitives: 0,
      };
      entry.files.add(r.file.hash);
      entry.layers++;
      entry.primitives += layer.entities;
      hintCounts.set(layer.classHint, entry);
    }
}
const missing = results.filter((r) => r.references?.unresolved.length),
  limited = results.filter((r) => r.skipped?.limit);
const mismatch = results.filter((r) =>
  r.references?.loaded.some((ref) => ref.units.code !== r.header.units.code),
);
const evidence = [
  "",
  "## Hallazgos medidos (no exactitud del detector)",
  "",
  `- Unidades declaradas: ${Object.entries(unitCounts)
    .map(([u, n]) => `${u}: ${n}`)
    .join("; ")}. Ninguna calibración validada.`,
  `- Archivos que recuperaron geometría al resolver XREF: ${results.filter((r) => r.afterEntities > r.beforeEntities).length}.`,
  `- Unidades declaradas distintas entre lámina y alguna referencia cargada: ${mismatch.length}. Revisar transformación y cotas, sin reescalar automáticamente por el encabezado.`,
  `- Archivos con referencias pendientes: ${missing.length}. Archivos con límite de extracción alcanzado: ${limited.length}.`,
  `- Sin geometría en espacio modelo: ${
    results
      .filter((r) => r.status === "audited" && !r.afterEntities)
      .map((r) => r.file.name)
      .join(", ") || "ninguno"
  }. Puede haber contenido en presentación; no significa archivo vacío.`,
  "",
  "| Clase sugerida por nombre de capa | Archivos | Capas | Primitivas 2D (no objetos) |",
  "|---|---:|---:|---:|",
  ...[...hintCounts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) =>
        `| ${key} | ${value.files.size} | ${value.layers} | ${value.primitives} |`,
    ),
  "",
  "Entidades omitidas por el extractor, agregadas por lámina (la referencia compartida puede contarse varias veces):",
  "",
  ...Object.entries(skipped)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => `- ${k}: ${v}`),
  "",
  "Estos conteos no prueban que una clase sea aprendible. Hay que corregir semántica, separar vistas y reunir ejemplos y negativos revisados de varios edificios. Vigas, cimentación y válvulas requieren además ampliar la taxonomía de evaluación/renderizado existente.",
  "",
];
fs.appendFileSync(path.join(output, "INFORME.md"), evidence.join("\n"));
// Review sheets intentionally leave approval fields empty; never turn regex hints into truth.
const csv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const rows = [
  [
    "sourceHash",
    "sourceName",
    "layerName",
    "primitiveCount",
    "visible",
    "proposedClass",
    "approvedClass",
    "geometryType",
    "viewType",
    "annotator",
    "reviewer",
    "reviewStatus",
    "notes",
  ],
];
for (const r of results.filter((r) => r.status === "audited"))
  for (const layer of r.layers)
    rows.push([
      r.file.hash,
      r.file.name,
      layer.name,
      layer.entities,
      layer.visible,
      layer.classHint ?? "",
      "",
      "",
      "",
      "",
      "",
      "pending",
      "",
    ]);
fs.writeFileSync(
  path.join(output, "layer-review.csv"),
  "\ufeff" + rows.map((row) => row.map(csv).join(",")).join("\n"),
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    output,
    files: files.length,
    unique: unique.length,
    audited: results.filter((r) => r.status === "audited").length,
    failed: results.filter((r) => r.status === "failed").length,
  }),
);
if (results.some((r) => r.status === "failed")) process.exitCode = 1;

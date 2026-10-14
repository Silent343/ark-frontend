// Isolated worker: parser memory and a malformed DWG cannot contaminate the next source.
import fs from "node:fs";
import path from "node:path";
import * as acad from "../public/vendor/plan-tools/acad.bundle.js";
import { loadDomain } from "./lib/domain-loader.mjs";
import {
  sha256,
  referenceIndex,
  resolveSelectedReference,
  unitEvidence,
  combinedBounds,
  classHint,
  disciplineHint,
  blockProposals,
} from "./lib/corpus-audit.mjs";
const [indexPath, hash, output] = process.argv.slice(2);
const files = JSON.parse(fs.readFileSync(indexPath, "utf8")).files;
const file = files.find((f) => f.hash === hash);
if (!file) throw new Error("Source not in selected inventory.");
const cache = new Map(),
  index = referenceIndex(files);
function read(source) {
  if (cache.has(source.hash)) return cache.get(source.hash);
  if (source.bytes > 32 * 1024 * 1024)
    throw new Error("Source exceeds application DWG limit (32 MiB).");
  const bytes = fs.readFileSync(source.path);
  if (sha256(bytes) !== source.hash)
    throw new Error("Source changed after inventory; create a new audit run.");
  const doc = acad.DwgReader.readFromStream(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  cache.set(source.hash, doc);
  return doc;
}
const doc = read(file);
const { extractCadDrawing } = loadDomain(
  "src/bounded-contexts/plan-digitization/infrastructure/cad-plan-geometry",
);
const { resolveCadExternalReferences } = loadDomain(
  "src/bounded-contexts/plan-digitization/infrastructure/cad-external-references",
);
const before = extractCadDrawing(doc, acad);
const requested = [...(doc.blockRecords ?? [])].flatMap((b) =>
  b.blockEntity?.xRefPath
    ? [
        {
          name: b.name,
          path: b.blockEntity.xRefPath,
          embeddedEntities: b.entities.count,
        },
      ]
    : [],
);
const unresolved = resolveCadExternalReferences(doc, (name) => {
  const selected = resolveSelectedReference(index, name);
  return selected ? read(selected) : undefined;
});
const source = extractCadDrawing(doc, acad);
const layerCounts = new Map(),
  blockCounts = new Map(),
  types = {};
for (const e of source.shapes) {
  layerCounts.set(e.layer, (layerCounts.get(e.layer) ?? 0) + 1);
  types[e.kind] = (types[e.kind] ?? 0) + 1;
  if (e.blockName && e.group) {
    const groups = blockCounts.get(e.blockName) ?? new Set();
    groups.add(e.group);
    blockCounts.set(e.blockName, groups);
  }
}
const result = {
  schemaVersion: 1,
  file,
  disciplineHint: disciplineHint(file.name),
  independentReview: false,
  header: {
    signature: fs.readFileSync(file.path).subarray(0, 6).toString("ascii"),
    units: unitEvidence(doc.header?.insUnits),
  },
  beforeEntities: before.shapes.length,
  afterEntities: source.shapes.length,
  types,
  skipped: source.skipped,
  spaces: [...(doc.blockRecords ?? [])]
    .filter((b) => /^\*?(model|paper)_?space/i.test(b.name))
    .map((b) => ({
      name: b.name,
      rawEntityCount: b.entities.count,
      layout: b.layout?.name ?? null,
      viewportCount: b.viewports?.length ?? 0,
    })),
  references: {
    requested,
    unresolved,
    loaded: [...cache.keys()]
      .filter((h) => h !== file.hash)
      .map((h) => ({
        hash: h,
        units: unitEvidence(cache.get(h).header?.insUnits),
      })),
  },
  layers: [...layerCounts]
    .map(([name, entities]) => ({
      name,
      entities,
      classHint: classHint(name),
      reviewed: false,
      visible: source.layers.find((l) => l.name === name)?.visible ?? true,
    }))
    .sort((a, b) => b.entities - a.entities),
  blocks: [...blockCounts]
    .map(([name, instances]) => ({
      name,
      instances: instances.size,
      classHint: classHint(name),
      reviewed: false,
    }))
    .sort((a, b) => b.instances - a.instances),
  bounds: combinedBounds(source.shapes),
  notes: source.shapes
    .filter(
      (e) =>
        e.kind === "text" &&
        /PLANTA|CORTE|ELEVACI|N\.?P\.?T|LEYENDA|ESCALA|DIAMETRO|PENDIENTE/i.test(
          e.value,
        ),
    )
    .slice(0, 60)
    .map((e) => ({ text: e.value, at: [e.x, e.y], layer: e.layer })),
  proposals: blockProposals(source.shapes),
};
fs.writeFileSync(output, JSON.stringify(result, null, 2), { flag: "wx" });
fs.writeFileSync(
  path.join(path.dirname(output), `${hash}.vectors.json`),
  JSON.stringify({
    sourceHash: hash,
    bounds: result.bounds,
    shapes: source.shapes,
  }),
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    name: file.name,
    before: before.shapes.length,
    after: source.shapes.length,
    layers: result.layers.length,
    missing: unresolved,
    skipped: source.skipped,
  }),
);

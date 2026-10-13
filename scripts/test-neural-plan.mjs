import assert from "node:assert/strict";
import fs from "node:fs";
import { loadDomain } from "./lib/domain-loader.mjs";
const domain = "src/bounded-contexts/plan-digitization/domain/";
const { vectorizeNeuralWalls, cadNeuralSignature, validCadNeural } = loadDomain(
  domain + "neural-plan",
);
const { createCadPlan, compileCadBlueprint } = loadDomain(
  domain + "cad-operations",
);
const { validModelEvidence } = loadDomain(domain + "model-evidence");
const { modelDetectionExport } = loadDomain(domain + "detection-sample");
const { stageCadBlueprint } = loadDomain(domain + "cad-reconstruction");
const size = 64,
  mask = new Uint8Array(size * size),
  scores = new Uint8Array(mask.length).fill(255);
assert.equal(vectorizeNeuralWalls(mask, scores, size, size, 0.05).length, 0);
for (let x = 10; x < 54; x++)
  for (let y = 28; y < 34; y++) mask[y * size + x] = 1;
const walls = vectorizeNeuralWalls(mask, scores, size, size, 0.05);
assert(
  walls.some(
    (w) => Math.abs(w.b[0] - w.a[0]) > 30 && Math.abs(w.b[1] - w.a[1]) < 2,
  ),
);
assert(walls.every((w) => w.thickness >= 0.2 && w.thickness <= 0.4));
scores.fill(0);
assert.equal(vectorizeNeuralWalls(mask, scores, size, size, 0.05).length, 0);
mask.fill(0);
scores.fill(255);
for (let x = 10; x < 50; x++)
  for (let d = -2; d <= 2; d++) mask[(x + d) * size + x] = 1;
assert(
  vectorizeNeuralWalls(mask, scores, size, size, 0.05).some(
    (w) => Math.abs(w.b[0] - w.a[0]) > 20 && Math.abs(w.b[1] - w.a[1]) > 20,
  ),
  "diagonals must not become axis-aligned staircases",
);
assert.throws(() => vectorizeNeuralWalls(mask, scores, 64.5, 64, 0.05));
assert.throws(() => vectorizeNeuralWalls(mask, scores, 64, 64, 0));
const cad = createCadPlan(
  "test.dwg",
  [
    {
      id: "edge",
      kind: "path",
      layer: "WALL",
      color: "#222",
      points: [0, 0, 10, 0, 10, 8, 0, 8, 0, 0],
      closed: false,
    },
  ],
  [{ name: "WALL", count: 1, visible: true }],
  {},
);
const region = cad.regions[0],
  signature = cadNeuralSignature(cad, region);
const analysis = {
  regionId: region.id,
  sourceSignature: signature,
  applied: false,
  model: {
    id: "openbim-m2-unet",
    revision: "v1.0.0",
    checkpointSha256: "a".repeat(64),
    artifactSha256: "b".repeat(64),
    usage: "experimental-research",
    classes: ["background", "wall", "door", "window"],
  },
  walls: [{ a: [0, 0], b: [5, 0], thickness: 0.2, sourceIds: ["edge"] }],
  overlay: "data:image/png;base64,AA==",
  counts: [0, 100, 0, 0],
  elapsedMs: 100,
};
assert(validCadNeural({ ...cad, neural: [analysis] }));
assert(
  !validCadNeural({
    ...cad,
    neural: [{ ...analysis, sourceSignature: [signature] }],
  }),
);
assert(
  !validCadNeural({
    ...cad,
    neural: [
      {
        ...analysis,
        walls: [{ ...analysis.walls[0], sourceIds: ["invented"] }],
      },
    ],
  }),
);
assert.equal(
  cadNeuralSignature({ ...cad, neural: [analysis] }, region),
  signature,
);
assert.notEqual(
  cadNeuralSignature(
    { ...cad, metersPerCadUnit: cad.metersPerCadUnit * 100 },
    region,
  ),
  signature,
);
assert.notEqual(
  cadNeuralSignature(cad, { ...region, maxX: region.maxX + 1 }),
  signature,
);
assert.notEqual(
  cadNeuralSignature({ ...cad, entities: [] }, region),
  signature,
);
const base = JSON.parse(
  fs.readFileSync(new URL("../public/db.json", import.meta.url)),
).blueprint;
const active = {
  ...cad,
  unitConfirmed: true,
  neural: [{ ...analysis, applied: true }],
};
const staged = stageCadBlueprint(base, cad);
assert.equal(staged.walls.length, 0);
assert.equal(
  staged.cad,
  cad,
  "staging preserves the editable CAD and its regions",
);
assert(staged.review.warnings.includes("cad-awaiting-units"));
assert(validModelEvidence(staged));
const model = compileCadBlueprint(base, active);
assert(
  model.walls.length > 0 &&
    Object.values(model.elementEvidence).some(
      (e) => e.method === "neural-mask",
    ),
);
assert(
  validModelEvidence(model),
  "learned paths with no CAD source ID must keep valid provenance",
);
assert.equal(modelDetectionExport(model).detector.id, "ark-cad-neural-hybrid");
for (const changed of [
  { ...active, unitConfirmed: false },
  { ...active, metersPerCadUnit: 2 },
  { ...active, neural: [{ ...analysis, applied: false }] },
]) {
  assert(
    !Object.values(compileCadBlueprint(base, changed).elementEvidence).some(
      (e) => e.method === "neural-mask",
    ),
    "stale/unconfirmed/unapplied neural geometry must not reach 3D",
  );
}
console.log(
  "Neural masks: blank/low-confidence/diagonal/thickness/bounds/provenance/source invalidation passed.",
);

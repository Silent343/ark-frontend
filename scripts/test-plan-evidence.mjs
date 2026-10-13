import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const cache = new Map(),
  root = path.resolve(import.meta.dirname, "..");
function load(name) {
  const file = path.resolve(root, name.endsWith(".ts") ? name : name + ".ts");
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} };
  cache.set(file, loaded);
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, {
    filename: file,
  })(
    (id) => load(path.resolve(path.dirname(file), id)),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
const domain = "src/bounded-contexts/plan-digitization/domain/";
const ops = load(domain + "cad-operations"),
  evidence = load(domain + "cad-evidence");
const { cleanCadText } = load(domain + "cad-text");
assert.equal(cleanCadText("%%UPLANTA BAJA%%u"), "PLANTA BAJA");
assert.equal(cleanCadText("baU+00F1o"), "baño");
const edge = (id, points, layer = "MUROS") => ({
  id,
  points,
  layer,
  kind: "path",
  closed: false,
  color: "#374151",
});
const walls = [
  edge("a", [0, 0, 12, 0]),
  edge("b", [12, 0, 12, 8]),
  edge("c", [12, 8, 0, 8]),
  edge("d", [0, 8, 0, 0]),
];
const terrace = {
  id: "terrace",
  kind: "text",
  layer: "TEXT",
  color: "#374151",
  x: 10,
  y: 3,
  height: 0.15,
  rotation: 0,
  value: "TERRAZA",
};
const cad = ops.createCadPlan(
  "restaurant.dwg",
  [...walls, terrace],
  [
    { name: "MUROS", visible: true, count: 4 },
    { name: "TEXT", visible: true, count: 1 },
  ],
  {},
);
assert.equal(cad.regions.length, 1);
assert.equal(cad.regions[0].elevation, 0);
assert.equal(cad.regions[0].minX, 0);
assert.equal(cad.regions[0].maxX, 12);
const detachedSymbol = ops.createCadPlan(
  "detached-door.dwg",
  [...walls, edge("library-door", [-250, 2, -249, 3], "PUERTAS")],
  [...cad.layers, { name: "PUERTAS", visible: true, count: 1 }],
  {},
);
assert.equal(detachedSymbol.regions[0].minX, 0);
assert.equal(
  detachedSymbol.entities.length,
  5,
  "Detached symbols remain in the source CAD",
);
// Sheet titles are not left-shifted by an assumed text width: that used to
// split one house between two storeys and duplicate walls in the 3D model.
const adjacentEntities = [0, 20, 40].flatMap((offset, floor) => [
  ...Array.from({ length: 9 }, (_, i) =>
    edge(`adjacent-${floor}-${i}`, [
      14 + offset + i * 1.6,
      72,
      14 + offset + i * 1.6,
      88,
    ]),
  ),
  {
    ...terrace,
    id: `title-${floor}`,
    x: 18 + offset,
    y: 68,
    height: 0.36,
    value: ["PLANTA BAJA", "PLANTA ALTA", "PLANTA DE AZOTEA"][floor],
  },
]);
const adjacent = ops.createCadPlan(
  "adjacent.dwg",
  adjacentEntities,
  cad.layers,
  {},
);
assert.equal(adjacent.regions.length, 3);
assert(adjacent.regions[0].maxX < adjacent.regions[1].minX);
assert(adjacent.regions[1].maxX < adjacent.regions[2].minX);
assert.equal(adjacent.regions[0].minX, 14);
assert.equal(adjacent.regions[1].minX, 34);
assert.equal(adjacent.regions[2].minX, 54);
assert.equal(evidence.fixtureKind("cama en planta - referencia"), "bed");
assert.equal(evidence.fixtureKind("CAMA ALZADO FRONTAL"), undefined);
assert.equal(evidence.blockRole("puerta0.80"), "door");
assert.equal(evidence.blockRole("SIMB EJE"), "reference");
const pairs = [];
for (let i = 0; i < 6; i++) {
  pairs.push(
    edge("p" + i, [i * 2, 0, i * 2, 8], "2"),
    edge("q" + i, [i * 2 + 0.2, 0, i * 2 + 0.2, 8], "2"),
  );
}
assert(evidence.anonymousWallLayer(pairs, 1));
assert(
  !evidence.anonymousWallLayer(
    pairs.map((e) => ({ ...e, group: "dimension-1" })),
    1,
  ),
);
const numeric = ops.createCadPlan(
  "numeric.dwg",
  pairs,
  [{ name: "2", count: 12, visible: true }],
  {},
);
assert.equal(numeric.layers[0].role, "wall");
assert.equal(numeric.layers[0].inferred, true);
numeric.layers[0] = { ...numeric.layers[0], role: "reference", reviewed: true };
ops.enrichCadEvidence(numeric);
assert.equal(numeric.layers[0].role, "reference");
const base = JSON.parse(
  fs.readFileSync(path.join(root, "public/db.json"), "utf8"),
).blueprint;
const bed = {
  ...edge("bed", [2, 2, 4, 2, 4, 4, 2, 4], "MUEBLES"),
  closed: true,
  group: "block-bed",
  blockName: "cama doble",
};
const furnished = ops.createCadPlan(
  "bed.dwg",
  [...walls, bed],
  [
    { name: "MUROS", count: 4, visible: true },
    { name: "MUEBLES", count: 1, visible: true },
  ],
  {},
);
const model = ops.compileCadBlueprint(base, furnished);
assert.equal(model.fixtures.length, 1);
assert.equal(model.fixtures[0].kind, "bed");
assert.equal(model.fixtures[0].evidence, "block");
assert.deepEqual(model.fixtures[0].sourceIds, ["bed"]);
const { validModelEvidence } = load(domain + "model-evidence");
const { inspectModel, modelReadiness } = load(domain + "model-inspection");
const { modelIntegrityIssues } = load(domain + "model-integrity");
const integrityPlan = {
  ...base,
  levels: [{ id: "ground", elevation: 0 }],
  walls: [
    { id: "wall", start: [0, 0], end: [600, 0], thickness: 12, height: 3 },
  ],
  doors: [
    {
      id: "door",
      wallId: "wall",
      x: 120,
      y: 0,
      width: 60,
      height: 2.1,
      rotation: 0,
    },
  ],
  windows: [],
};
assert.equal(modelIntegrityIssues(integrityPlan).length, 0);
assert(
  modelIntegrityIssues({
    ...integrityPlan,
    doors: [{ ...integrityPlan.doors[0], height: 4 }],
  }).some((i) => i.code === "outside-wall"),
);
assert(
  modelIntegrityIssues({
    ...integrityPlan,
    doors: [{ ...integrityPlan.doors[0], wallId: "missing" }],
  }).some((i) => i.code === "missing-host"),
);
assert(
  modelIntegrityIssues({
    ...integrityPlan,
    doors: [
      integrityPlan.doors[0],
      { ...integrityPlan.doors[0], id: "duplicate" },
    ],
  }).some((i) => i.code === "overlapping-opening"),
);
assert(
  modelIntegrityIssues({
    ...integrityPlan,
    walls: [{ ...integrityPlan.walls[0], end: [0, 0] }],
  }).some((i) => i.code === "invalid-wall"),
);
assert.equal(model.reconstruction.version, 4);
assert(
  validModelEvidence(model),
  "Compiled source references must be resolvable",
);
assert.deepEqual(model.elementEvidence[model.fixtures[0].id].sourceIds, [
  "bed",
]);
assert(model.elementEvidence[model.fixtures[0].id].assumed.includes("height"));
assert(inspectModel(model).some((e) => e.id === model.fixtures[0].id));
assert(
  modelReadiness(model).some((c) => c.id === "height"),
  "Defaults must be visible as pending evidence",
);
const tampered = structuredClone(model);
tampered.elementEvidence[model.fixtures[0].id].sourceIds = ["invented"];
assert(!validModelEvidence(tampered));
const { reconstructWalls, mergeLines } = load(domain + "cad-topology");
const paired = reconstructWalls([
  { a: [0, 0], b: [8, 0], source: "face-a", thickness: 0 },
  { a: [0, 0.2], b: [8, 0.2], source: "face-b", thickness: 0 },
]);
assert.equal(paired.length, 1);
assert.deepEqual(new Set(paired[0].sourceIds), new Set(["face-a", "face-b"]));
assert.equal(
  mergeLines([
    { a: [0, 0], b: [4, 0], source: "part-a", thickness: 0 },
    { a: [4, 0], b: [8, 0], source: "part-b", thickness: 0 },
  ])[0].sourceIds.length,
  2,
);
const tall = structuredClone(furnished);
tall.regions = [
  {
    ...tall.regions[0],
    id: "auditorium",
    elevation: 0,
    elevationSource: "annotation",
  },
  {
    ...tall.regions[0],
    id: "upper",
    elevation: 9.6,
    elevationSource: "annotation",
  },
];
const tallModel = ops.compileCadBlueprint(base, tall);
assert.equal(
  tallModel.levels[0].height,
  9.6,
  "A measured tall space must not be clamped to a generic storey height",
);
assert.equal(tallModel.levels[0].heightSource, "levels");
tall.regions[0].wallHeight = 8.4;
const confirmed = ops.compileCadBlueprint(base, tall);
assert.equal(confirmed.levels[0].height, 8.4);
assert.equal(confirmed.levels[0].heightSource, "manual");
const structuralCopy = structuredClone(tall);
structuralCopy.entities.push({
  ...edge("column-source", [1, 1, 1.5, 1, 1.5, 1.5, 1, 1.5], "COLUMNAS"),
  closed: true,
});
structuralCopy.layers.push({
  name: "COLUMNAS",
  role: "column",
  visible: true,
  count: 1,
});
const structuralModel = ops.compileCadBlueprint(base, structuralCopy);
assert(structuralModel.columns.length > 0);
assert.equal(
  structuralModel.columns[0].height,
  9.6,
  "Wall-height adjustments must not change the level-to-level span of columns",
);
assert(
  !confirmed.elementEvidence[confirmed.walls[0].id].assumed.includes("height"),
);
const shifted = structuredClone(tall);
shifted.regions[0].alignment = { x: 1.5, y: -0.5 };
const corrected = ops.compileCadBlueprint(base, shifted);
assert(
  Math.abs(corrected.walls[0].start[0] - confirmed.walls[0].start[0] - 90) <
    0.001,
  "Registration correction must be in metres, not CAD units",
);
assert(
  Math.abs(corrected.walls[0].start[1] - confirmed.walls[0].start[1] - 30) <
    0.001,
);
const { buildFixtureParts } = load(
  "src/bounded-contexts/spatial-visualization/application/fixture-parts",
);
const parts = buildFixtureParts(
  Array.from({ length: 500 }, (_, i) => ({
    ...model.fixtures[0],
    id: "chair" + i,
    kind: "chair",
  })),
  0,
  0,
  60,
);
assert(Object.values(parts).filter((a) => a.length).length <= 5);
assert.equal(parts.fabric.length, 1000);
assert.equal(parts.metal.length, 2000);
const { detectPlanLines } = load(
  "src/bounded-contexts/plan-digitization/application/detect-plan-lines",
);
const { detectColoredSpaces } = load(
  "src/bounded-contexts/plan-digitization/application/detect-colored-spaces",
);
const w = 180,
  h = 180,
  pixels = new Uint8ClampedArray(w * h * 4).fill(255);
for (let y = 25; y < 155; y++)
  for (let x = 25; x < 155; x++) {
    const i = (y * w + x) * 4,
      wall = x < 29 || x > 150 || y < 29 || y > 150;
    pixels.set(wall ? [90, 90, 90, 255] : [131, 109, 122, 255], i);
  }
const detected = detectPlanLines(pixels, w, h);
assert(
  detected.length >= 4 && detected.length <= 8,
  "Tinted fill must not become a grid of walls",
);
const floors = detectColoredSpaces(pixels, w, h, "ground");
assert.equal(floors.length, 1);
assert(floors[0].polygon.length >= 4);
const allWhite = new Uint8ClampedArray(w * h * 4).fill(255);
assert.equal(detectColoredSpaces(allWhite, w, h, "ground").length, 0);
console.log(
  "PASS: CAD evidence, metric registration, tall spaces, manual heights, host integrity, instanced fixtures and colored raster walls/floors.",
);

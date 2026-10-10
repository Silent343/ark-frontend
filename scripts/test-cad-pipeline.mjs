import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const root = path.resolve(import.meta.dirname, ".."),
  cache = new Map();
// Execute the real domain code, independent of React and a running browser.
function load(relative) {
  const file = path.resolve(
    root,
    relative.endsWith(".ts") ? relative : relative + ".ts",
  );
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
const {
  createCadPlan,
  compileCadBlueprint,
  moveCadEntity,
  transformCadEntity,
  cadEntityBounds,
} = load("src/bounded-contexts/plan-digitization/domain/cad-operations");
const base = {
  ...JSON.parse(fs.readFileSync(path.join(root, "public/db.json"), "utf8"))
    .blueprint,
  projectId: "cad-test",
};
const wall = (id, points) => ({
  id,
  kind: "path",
  layer: "MUROS",
  color: "#374151",
  closed: false,
  points,
});
const entities = [
  wall("w1", [0, 0, 10, 0]),
  wall("w2", [10, 0, 10, 8]),
  wall("w3", [10, 8, 0, 8]),
  wall("w4", [0, 8, 0, 0]),
  {
    id: "t1",
    kind: "text",
    layer: "TEXTOS",
    color: "#374151",
    x: 2,
    y: 3,
    height: 0.2,
    rotation: 0,
    value: "Sala",
  },
  wall("elevation-view", [100, 100, 130, 100]),
];
const cad = createCadPlan(
  "building.dwg",
  entities,
  [
    { name: "MUROS", visible: true, count: 5 },
    { name: "TEXTOS", visible: true, count: 1 },
  ],
  {},
);
cad.regions = [
  {
    id: "floor",
    name: "Pisos 1 y 2",
    minX: 0,
    minY: 0,
    maxX: 10,
    maxY: 8,
    elevation: 0,
    repeat: 2,
    enabled: true,
  },
];
const plan = compileCadBlueprint(base, cad);
assert.equal(plan.levels.length, 2);
assert.equal(plan.walls.length, 8);
assert.equal(plan.levels[1].elevation, 2.8);
assert.equal(plan.cad.entities.length, 6);
assert.ok(
  plan.walls.every((w) => !w.id.includes("elevation-view")),
  "A section outside the plan region cannot become a wall",
);
const moved = moveCadEntity(entities[0], 1, 2);
assert.deepEqual(moved.points, [1, 2, 11, 2]);
assert.deepEqual(entities[0].points, [0, 0, 10, 0]);
const rotated = transformCadEntity(entities[0], 90, 2);
const bounds = cadEntityBounds(rotated);
assert.ok(Math.abs(bounds.maxY - bounds.minY - 20) < 1e-6);
const hidden = compileCadBlueprint(base, {
  ...cad,
  regions: [{ ...cad.regions[0], enabled: false }],
});
assert.equal(hidden.walls.length, 0);
const annotations = compileCadBlueprint(base, {
  ...cad,
  layers: cad.layers.map((l) => ({ ...l, role: "reference" })),
});
assert.equal(annotations.walls.length, 0);
const centimeters = compileCadBlueprint(base, {
  ...cad,
  metersPerCadUnit: 0.01,
  entities: cad.entities.map((e) =>
    e.kind === "path"
      ? { ...e, points: e.points.map((n) => n * 100) }
      : { ...e, x: e.x * 100, y: e.y * 100 },
  ),
  regions: cad.regions.map((r) => ({
    ...r,
    minX: r.minX * 100,
    maxX: r.maxX * 100,
    minY: r.minY * 100,
    maxY: r.maxY * 100,
  })),
});
assert.equal(centimeters.walls[0].end[0] - centimeters.walls[0].start[0], 600);
const repeated = Array.from({ length: 600 }, (_, i) => ({
  ...entities[i % 4],
  id: `repeat-${i}`,
}));
const outlier = createCadPlan(
  "stray.dwg",
  [...repeated, wall("stray", [100000, 100000, 100010, 100000])],
  cad.layers,
  {},
);
assert.ok(outlier.bounds.maxX < 100);
assert.equal(
  outlier.entities.length,
  601,
  "Fit must retain the stray entity for DWG export",
);
console.log(
  "PASS: CAD layer interpretation, floor boundaries, repetition, unit conversion, immutable edits and stray-object fitting.",
);

const topology = load(
  "src/bounded-contexts/plan-digitization/domain/cad-topology",
);
const { detectFloorSurfaces } = load(
  "src/bounded-contexts/plan-digitization/domain/cad-floor-mask",
);
const { floorElevations } = load(
  "src/bounded-contexts/plan-digitization/domain/cad-reconstruction",
);
const line = (a, b) => ({ a, b, thickness: 0, source: "test" });
const paired = topology.reconstructWalls([
  line([0, 0], [5, 0]),
  line([0, 0.2], [5, 0.2]),
]);
assert.equal(
  paired.length,
  1,
  "Two faces must become one wall, not two thin skins",
);
assert.ok(Math.abs(paired[0].thickness - 0.2) < 1e-6);
const loop = (points) =>
  points.map((p, i) => line(p, points[(i + 1) % points.length]));
const courtyard = detectFloorSurfaces(
  [
    ...loop([
      [0, 0],
      [10, 0],
      [10, 8],
      [0, 8],
    ]),
    ...loop([
      [4, 3],
      [6, 3],
      [6, 5],
      [4, 5],
    ]),
  ],
  [],
  [
    { point: [5, 4], name: "VACÍO", void: true, room: false },
    { point: [2, 2], name: "Sala", void: false, room: true },
  ],
);
assert.equal(courtyard.surfaces.length, 1);
assert.equal(
  courtyard.surfaces[0].holes.length,
  1,
  "Explicit courtyard must stay open",
);
assert.equal(courtyard.rooms[0].name, "Sala");
assert.ok(courtyard.rooms[0].area < 80 && courtyard.rooms[0].area > 65);
assert.deepEqual(
  floorElevations(
    ["NPT. -3.15", "NPT. +3.33", "NPT. +3.33"].map((value) => ({
      ...entities[4],
      value,
    })),
  ),
  [3.33, -3.15],
);
const unequal = compileCadBlueprint(base, {
  ...cad,
  regions: [{ ...cad.regions[0], elevations: [0, 3.33] }],
});
assert.equal(unequal.levels[0].height, 3.33);
assert.equal(unequal.levels[1].elevation, 3.33);
const shifted = [
  line([0, 0], [10, 0]),
  line([0, 0], [0, 7]),
  line([2, 1], [6, 1]),
];
const aligned = topology.registerPlan(
  shifted.map((l) => ({
    ...l,
    a: [l.a[0] + 20, l.a[1] - 3],
    b: [l.b[0] + 20, l.b[1] - 3],
  })),
  shifted,
  [-21, 4],
);
assert.deepEqual(aligned.offset, [-20, 3]);
const closedColumn = {
  ...wall("column", [0, 0, 0.4, 0, 0.4, 0.4, 0, 0.4]),
  closed: true,
  layer: "COLUMNAS",
};
const safe = compileCadBlueprint(base, {
  ...cad,
  entities: [...cad.entities, closedColumn],
  layers: [
    ...cad.layers,
    { name: "COLUMNAS", role: "column", visible: true, count: 1 },
  ],
});
function finite(value) {
  if (typeof value === "number")
    assert.ok(Number.isFinite(value), "No NaN/Infinity can reach WebGL");
  else if (value && typeof value === "object")
    Object.values(value).forEach(finite);
}
finite(safe);
assert.ok(safe.columns.length > 0);
console.log(
  "PASS: measured wall thickness, courtyard holes, NPT heights, level registration, compact columns and finite geometry.",
);

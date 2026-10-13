import assert from "node:assert/strict";
import { loadDomain } from "./lib/domain-loader.mjs";
const domain = "src/bounded-contexts/plan-digitization/domain/";
const {
  drawingTextSources,
  dimensionProposals,
  targetSignature,
  resolveDrawingCorrespondences,
  validDrawingCorrespondences,
} = loadDomain(domain + "drawing-coordination");
const { compileCadBlueprint } = loadDomain(domain + "cad-reconstruction");
const { modelDetectionExport } = loadDomain(domain + "detection-sample");
const wall = {
  id: "wall",
  levelId: "ground",
  start: [0, 0],
  end: [600, 0],
  thickness: 12,
  height: 2.8,
};
const line = {
  id: "cut-height",
  kind: "text",
  layer: "TEXT",
  color: "#333333",
  x: 15,
  y: 2,
  height: 0.2,
  rotation: 0,
  value: "ALTURA LIBRE = 3.20 m",
};
const region = {
  id: "cut",
  name: "Corte A-A",
  minX: 14,
  minY: 0,
  maxX: 20,
  maxY: 10,
  elevation: 0,
  enabled: true,
  repeat: 1,
  viewType: "section",
};
const base = {
  projectId: "test",
  width: 1000,
  height: 1000,
  scale: "metric",
  levels: [{ id: "ground", name: "PB", elevation: 0 }],
  walls: [wall],
  doors: [],
  windows: [],
  columns: [],
  rooms: [],
  materials: [],
  seismic: {
    defaultIntensity: 1,
    defaultDuration: 1,
    defaultDirection: "X",
    maxDisplacement: 1,
    maxDrift: 1,
  },
  calibration: {
    metersPerUnit: 1 / 60,
    referencePoints: [
      [0, 0],
      [600, 0],
    ],
    referenceDistanceM: 10,
  },
  cad: {
    sourceName: "test.dwg",
    metersPerCadUnit: 1,
    unitConfirmed: true,
    entities: [line],
    layers: [{ name: "TEXT", role: "reference", visible: true, count: 1 }],
    regions: [region],
    bounds: { minX: 0, minY: 0, maxX: 20, maxY: 10 },
    skipped: {},
  },
};
function link(
  plan,
  id = "link",
  targetId = "wall",
  property = "height",
  valueM = 3.2,
) {
  const s = drawingTextSources(plan)[0];
  return {
    id,
    source: {
      kind: s.kind,
      viewId: s.viewId,
      textId: s.textId,
      signature: s.signature,
    },
    targetId,
    targetSignature: targetSignature(plan, targetId),
    property,
    valueM,
    quote: s.text,
    confirmedAt: "2026-10-13T12:00:00.000Z",
  };
}
assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      dimensionProposals("ALTURA LIBRE = 320 cm; ANTEPECHO: 900 mm"),
    ),
  ),
  [
    { property: "height", valueM: 3.2 },
    { property: "sillHeight", valueM: 0.9 },
  ],
);
assert.equal(
  dimensionProposals("NPT +3.20, 4 pisos, escala 1:100, 0.90x2.10").length,
  0,
  "Unlabelled numbers must not become clear heights",
);
assert.equal(
  dimensionProposals("H = 4.2").length,
  0,
  "An explicit unit is required",
);
const linked = { ...base, correspondences: [link(base)] };
assert(validDrawingCorrespondences(linked));
const resolved = resolveDrawingCorrespondences(linked);
assert.equal(resolved.plan.walls[0].height, 3.2);
assert.equal(base.walls[0].height, 2.8, "Never overwrite detector output");
assert.equal(resolved.results[0].status, "applied");
assert.equal(
  resolveDrawingCorrespondences({
    ...linked,
    cad: {
      ...base.cad,
      entities: [{ ...line, value: "ALTURA LIBRE = 4.10 m" }],
    },
  }).results[0].status,
  "stale",
);
assert.equal(
  resolveDrawingCorrespondences({
    ...linked,
    walls: [{ ...wall, end: [500, 0] }],
  }).results[0].status,
  "stale",
);
assert.equal(
  resolveDrawingCorrespondences({
    ...linked,
    walls: [{ ...wall, height: 3.5 }],
  }).results[0].status,
  "stale",
);
assert.equal(
  resolveDrawingCorrespondences({
    ...linked,
    cad: { ...base.cad, regions: [] },
  }).results[0].status,
  "stale",
);
const conflicted = resolveDrawingCorrespondences({
  ...base,
  correspondences: [link(base), link(base, "other", "wall", "height", 3.6)],
});
assert.equal(conflicted.plan.walls[0].height, 2.8);
assert(conflicted.results.every((r) => r.status === "conflict"));
assert.equal(
  resolveDrawingCorrespondences({
    ...linked,
    cad: { ...base.cad, unitConfirmed: false },
  }).results[0].status,
  "incompatible",
);
const withWindow = {
  ...base,
  windows: [
    {
      id: "window",
      levelId: "ground",
      wallId: "wall",
      x: 300,
      y: 0,
      width: 60,
      rotation: 0,
      height: 1.2,
      sillHeight: 0.9,
    },
  ],
};
const incompatible = resolveDrawingCorrespondences({
  ...withWindow,
  correspondences: [link(withWindow, "high", "window", "height", 2.4)],
});
assert.equal(incompatible.plan.windows[0].height, 1.2);
assert.equal(incompatible.results[0].status, "incompatible");
const compatible = resolveDrawingCorrespondences({
  ...withWindow,
  correspondences: [
    link(withWindow, "high", "window", "height", 2.4),
    link(withWindow, "host", "wall", "height", 3.6),
  ],
});
assert.equal(compatible.plan.windows[0].height, 2.4);
assert.equal(compatible.plan.walls[0].height, 3.6);
assert(compatible.results.every((r) => r.status === "applied"));
// Reducing a host must roll back its group, not silently truncate an associated opening.
const low = resolveDrawingCorrespondences({
  ...withWindow,
  correspondences: [
    link(withWindow, "host", "wall", "height", 1.5),
    link(withWindow, "sill", "window", "sillHeight", 0.5),
  ],
});
assert.equal(low.plan.walls[0].height, 2.8);
assert.equal(low.plan.windows[0].sillHeight, 0.9);
assert(low.results.every((r) => r.status === "incompatible"));
assert(
  !validDrawingCorrespondences({
    ...linked,
    correspondences: [{ ...linked.correspondences[0], valueM: Infinity }],
  }),
);
// A saved section page remains identifiable across primary CAD rebuilds.
const reference = {
  id: "sheet",
  name: "Corte",
  viewType: "section",
  levelId: "ground",
  sourceName: "section.pdf",
  page: 1,
  discipline: "architecture",
  image: "data:image/png;base64,AA==",
  x: 0,
  y: 0,
  width: 900,
  height: 600,
  metersPerUnit: 1,
  evidence: { method: "manual-tracing", warnings: [], text: [] },
};
const edges = [
  [0, 0, 10, 0],
  [10, 0, 10, 8],
  [10, 8, 0, 8],
  [0, 8, 0, 0],
].map((points, i) => ({
  id: `edge-${i}`,
  kind: "path",
  points,
  closed: false,
  layer: "WALL",
  color: "#333333",
}));
const cad = {
  ...base.cad,
  entities: [
    ...edges,
    line,
    { ...edges[0], id: "cut-line", points: [15, 0, 19, 0] },
  ],
  layers: [
    ...base.cad.layers,
    { name: "WALL", role: "wall", visible: true, count: 5 },
  ],
  regions: [
    { ...region, id: "plan", name: "PB", viewType: "plan", minX: 0, maxX: 10 },
    region,
  ],
};
const compiled = compileCadBlueprint({ ...base, sheets: [reference] }, cad);
assert.equal(compiled.reconstruction.version, 6);
assert.equal(compiled.walls.length, 4, "Section linework never becomes walls");
assert.equal(compiled.sheets[0].id, "sheet");
assert(compiled.levels.some((l) => l.id === "ground"));
const prediction = modelDetectionExport(withWindow);
const { createCadPlan } = loadDomain(domain + "cad-operations");
const mmCad = createCadPlan(
  "millimeters.dwg",
  edges.map((e) => ({ ...e, points: e.points.map((v) => v * 1000) })),
  [{ name: "WALL", visible: true, count: 4 }],
  {},
  2.8,
  0.001,
);
assert.equal(mmCad.unitConfirmed, true);
assert.equal(mmCad.metersPerCadUnit, 0.001);
const mmPlan = compileCadBlueprint(base, mmCad);
const mmPrediction = modelDetectionExport(mmPlan);
assert.equal(
  mmPrediction.samples[0].objects.filter((o) => o.class === "wall").length,
  4,
);
assert(
  mmPrediction.samples[0].objects
    .filter((o) => o.class === "wall")
    .every((o) => o.bbox[2] - o.bbox[0] < 11),
);
assert.throws(
  () =>
    modelDetectionExport({
      ...withWindow,
      cad: { ...withWindow.cad, unitConfirmed: false },
    }),
  /escala/,
);
assert.equal(prediction.samples.length, 1);
assert.equal(prediction.samples[0].units, "m");
assert.equal(
  prediction.samples[0].objects.find((o) => o.id === "wall").bbox[2],
  10,
);
assert.equal(
  prediction.samples[0].objects.find((o) => o.id === "window").hostId,
  "wall",
);
console.log(
  "PASS: cross-view proposals, stale references, conflicting sources, metric/host checks, non-mutating 3D dimensions, CAD reference retention and detector export.",
);

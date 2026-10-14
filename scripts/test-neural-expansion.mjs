import assert from "node:assert/strict";
import fs from "node:fs";
import { loadDomain } from "./lib/domain-loader.mjs";
const root = "src/bounded-contexts/plan-digitization/";
const { createCadPlan, compileCadBlueprint } = loadDomain(
  root + "domain/cad-operations",
);
const { validCadNeural, cadNeuralSignature } = loadDomain(
  root + "domain/neural-plan",
);
const { EXPANDED_NEURAL_CLASSES } = loadDomain(root + "domain/neural-contract");
const {
  extractNeuralInstances,
  fuseNeuralInstances,
  associateNeuralOpening,
  polygonArea,
  convexIntersection,
} = loadDomain(root + "domain/neural-instances");
const { neuralTiles, neuralTileView } = loadDomain(
  root + "application/neural-tiles",
);
const { NeuralVectorization, clipNeuralWall } = loadDomain(
  root + "application/neural-vectorization",
);
const model = {
  id: "cubicasa-multitask-v1",
  revision: "c".repeat(40),
  checkpointSha256: "a".repeat(64),
  artifactSha256: "b".repeat(64),
  usage: "experimental-research",
  classes: EXPANDED_NEURAL_CLASSES,
};
const square = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const object = (id, kind, polygon) => ({
  id,
  kind,
  polygon,
  score: 0.9,
  tileIds: ["tile-0"],
  approved: false,
});
assert.equal(
  polygonArea(convexIntersection(square(0, 0, 2, 2), square(1, 1, 2, 2))),
  1,
);
assert.equal(
  fuseNeuralInstances([
    object("a", "sink", square(0, 0, 1, 1)),
    { ...object("b", "sink", square(0.1, 0, 1, 1)), tileIds: ["tile-1"] },
    object("c", "sink", square(2, 0, 1, 1)),
  ]).length,
  2,
);
assert.equal(
  fuseNeuralInstances([
    object("a", "sink", square(0, 0, 1, 1)),
    object("b", "toilet", square(0, 0, 1, 1)),
  ]).length,
  2,
);
const axes = [{ a: [0, 0], b: [5, 0], thickness: 0.2 }];
const hosted = associateNeuralOpening(
  object("door", "door", square(2, -0.1, 0.8, 0.2)),
  axes,
  1,
);
assert.equal(hosted.hostStatus, "hosted");
assert(Math.abs(hosted.widthM - 0.8) < 1e-9);
assert.equal(
  associateNeuralOpening(
    object("door", "door", square(2, -0.1, 0.8, 0.2)),
    [...axes, ...axes],
    1,
  ).hostStatus,
  "ambiguous",
);
assert.equal(
  associateNeuralOpening(
    object("door", "door", square(20, 20, 0.8, 0.2)),
    axes,
    1,
  ).hostStatus,
  "unhosted",
);
assert.deepEqual(
  clipNeuralWall({ ...axes[0], source: "edge" }, 1, -1, 3, 1).a,
  [1, 0],
);
assert.equal(clipNeuralWall({ ...axes[0], source: "edge" }, 1, 1, 3, 2), null);
const cad = createCadPlan(
  "neural-test.dwg",
  [
    {
      id: "edge",
      kind: "path",
      layer: "WALL",
      role: "wall",
      color: "#222",
      points: [0.1, 2, 7.9, 2],
      closed: false,
    },
  ],
  [{ name: "WALL", role: "wall", count: 1, visible: true }],
  {},
);
cad.metersPerCadUnit = 1;
cad.unitConfirmed = true;
cad.regions = [
  {
    id: "floor",
    name: "Planta baja",
    minX: 0,
    minY: 0,
    maxX: 8,
    maxY: 4,
    enabled: true,
    repeat: 1,
    elevation: 0,
    wallHeight: 3,
    viewType: "plan",
  },
];
const region = cad.regions[0],
  tiles = neuralTiles(cad, region, 0.01);
assert.equal(tiles.length, 2);
assert.throws(() =>
  neuralTiles({ ...cad, unitConfirmed: false }, region, 0.01),
);
assert.throws(() => neuralTiles(cad, { ...region, maxX: 1e10 }, 0.005));
const centimeters = { ...cad, metersPerCadUnit: 0.01 };
const cmView = neuralTileView(
    centimeters,
    { ...region, maxX: 800, maxY: 400 },
    tiles[0],
    0.01,
  ),
  mView = neuralTileView(cad, region, tiles[0], 0.01);
assert.equal(cmView.scale * 100, mView.scale);
assert.equal(cmView.y, mView.y);
const job = new NeuralVectorization(cad, region, 0.01);
assert.throws(() => job.finish());
for (const [index, tile] of tiles.entries()) {
  const mask = Buffer.alloc(512 * 512),
    scores = Buffer.alloc(mask.length, 255);
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const gx = tile.x + x,
        i = y * 512 + x;
      if (y >= 195 && y < 205 && gx >= 10 && gx < 790) mask[i] = 1;
      if (y >= 190 && y < 210 && gx >= 250 && gx < 330) mask[i] = 2;
      if (y >= 250 && y < 300 && gx >= 400 && gx < 450) mask[i] = 7;
      if (y >= 480) mask[i] = 7; // padding must not generate out-of-region objects
    }
  job.tile(
    {
      width: 512,
      height: 512,
      mask: mask.toString("base64"),
      scores: scores.toString("base64"),
      model,
      elapsedMs: 10,
      counts: [],
      overlay: "data:image/png;base64,AA==",
    },
    index,
  );
}
const result = job.finish();
assert.equal(
  result.openings.length,
  1,
  "overlap fragments must fuse without duplicating doors",
);
assert.equal(result.openings[0].hostStatus, "hosted");
assert.equal(
  result.fixtures.length,
  1,
  "duplicate sink in overlap and predictions in padding must be removed",
);
assert.equal(result.fixtures[0].kind, "sink");
assert.equal(
  result.walls.length,
  1,
  "clipped CAD wall axes merge without bridging real gaps",
);
assert.equal(result.tiling.tileCount, 2);
const analysis = {
  ...result,
  regionId: region.id,
  sourceSignature: cadNeuralSignature(cad, region),
  applied: true,
  overlay: "data:image/png;base64,AA==",
};
assert(validCadNeural({ ...cad, neural: [analysis] }));
const base = JSON.parse(fs.readFileSync("public/db.json", "utf8")).blueprint;
const pending = compileCadBlueprint(base, { ...cad, neural: [analysis] });
assert.equal(pending.doors.length, 0);
assert.equal(pending.fixtures.length, 0);
const approved = {
  ...analysis,
  openings: result.openings.map((i) => ({
    ...i,
    approved: true,
    heightM: 2.1,
  })),
  fixtures: result.fixtures.map((i) => ({
    ...i,
    approved: true,
    heightM: 0.85,
  })),
};
assert(validCadNeural({ ...cad, neural: [approved] }));
const compiled = compileCadBlueprint(base, { ...cad, neural: [approved] });
assert.equal(compiled.doors.length, 1);
assert.equal(compiled.fixtures.length, 1);
assert(compiled.walls.some((w) => w.id === compiled.doors[0].wallId));
assert.equal(compiled.fixtures[0].evidence, "neural-mask");
assert.equal(compiled.fixtures[0].height, 0.85);
assert.equal(
  compiled.elementEvidence[compiled.doors[0].id].method,
  "neural-mask",
);
for (const patch of [
  { heightM: undefined },
  { hostWallIndex: 999 },
  {
    polygon: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  },
  { widthM: NaN },
  { hostStatus: "ambiguous" },
]) {
  assert(
    !validCadNeural({
      ...cad,
      neural: [
        { ...approved, openings: [{ ...approved.openings[0], ...patch }] },
      ],
    }),
  );
}
assert(
  !validCadNeural({
    ...cad,
    neural: [{ ...approved, tiling: { ...approved.tiling, complete: false } }],
  }),
);
assert.equal(
  compileCadBlueprint(base, { ...cad, metersPerCadUnit: 2, neural: [approved] })
    .fixtures.length,
  0,
);
assert.equal(
  compileCadBlueprint(base, {
    ...cad,
    neural: [
      {
        ...approved,
        openings: approved.openings.map((i) => ({ ...i, heightM: 4 })),
      },
    ],
  }).doors.length,
  0,
  "openings taller than the wall are not clamped or silently fabricated",
);
const window = { ...approved.openings[0], kind: "window", sillM: undefined };
assert(
  !validCadNeural({ ...cad, neural: [{ ...approved, openings: [window] }] }),
);
const smallMask = new Uint8Array(64 * 64),
  smallScores = new Uint8Array(smallMask.length).fill(255);
for (let y = 10; y < 30; y++)
  for (let x = 10; x < 30; x++) smallMask[y * 64 + x] = 12;
assert.equal(
  extractNeuralInstances(
    smallMask,
    smallScores,
    64,
    64,
    EXPANDED_NEURAL_CLASSES,
    "tile-0",
    (p) => p,
    0.05,
  )[0].kind,
  "railing",
);
console.log(
  "Neural expansion: metric tiles, seam fusion, distinct icons, padding, ambiguity, explicit approval, host links, heights and stale source checks passed.",
);

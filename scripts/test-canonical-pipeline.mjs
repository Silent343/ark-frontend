import assert from "node:assert/strict";
import { loadDomain } from "./lib/domain-loader.mjs";
const root = "src/bounded-contexts/plan-digitization/";
const { buildPlanarGraph } = loadDomain(root + "domain/canonical/planar-graph");
const { canonicalFromBlueprint, canonicalRenderBlueprint } = loadDomain(
  root + "domain/canonical/blueprint-adapter",
);
const { validateCanonicalGraph } = loadDomain(
  root + "domain/canonical/validate-graph",
);
const { preparationReport } = loadDomain(root + "domain/canonical/preparation");
const { rasterTiles, fuseRasterWalls, detectTiledRaster } = loadDomain(
  root + "application/raster-tiles",
);
const { detectPlanLines } = loadDomain(root + "application/detect-plan-lines");
const { cadGeometricProposals, applyCadGeometricProposals } = loadDomain(
  root + "domain/cad-geometric-signatures",
);
const { polygonProblem } = loadDomain(
  root + "domain/canonical/polygon-validation",
);
const line = (a, b, id = "w") => ({ start: a, end: b, wallId: id });
const ring = (left, bottom, right, top, prefix) => [
  line([left, bottom], [right, bottom], prefix + 1),
  line([right, bottom], [right, top], prefix + 2),
  line([right, top], [left, top], prefix + 3),
  line([left, top], [left, bottom], prefix + 4),
];
const rectangle = ring(0, 0, 10, 8, "w");
let topology = buildPlanarGraph(rectangle);
assert.equal(topology.nodes.length, 4);
assert.equal(topology.halfEdges.length, 8);
assert.equal(topology.faces.filter((f) => !f.exterior).length, 1);
assert.equal(
  buildPlanarGraph(rectangle.slice(0, 3)).faces.filter((f) => !f.exterior)
    .length,
  0,
  "open outline is not invented as a room",
);
topology = buildPlanarGraph([
  line([0, 0], [10, 0]),
  line([5, -5], [5, 5], "v"),
]);
assert.equal(
  topology.nodes.length,
  5,
  "X intersection split at one common node",
);
assert.equal(topology.halfEdges.length, 8);
topology = buildPlanarGraph([line([0, 0], [10, 0]), line([5, 0], [5, 5], "v")]);
assert.equal(topology.halfEdges.length, 6, "T intersection split");
topology = buildPlanarGraph([...rectangle, ...ring(3, 3, 4, 4, "p")]);
assert.equal(
  topology.faces.filter((f) => !f.exterior && f.polygon.holes.length === 1)
    .length,
  1,
  "nested contour becomes hole of enclosing face",
);
assert.equal(
  buildPlanarGraph([line([0, 0], [10, 0]), line([3, 0], [7, 0], "v")]).halfEdges
    .length,
  6,
  "collinear overlaps are split and deduplicated",
);
assert.throws(() => buildPlanarGraph([line([NaN, 0], [1, 1])]), /Non-finite/);
assert(
  polygonProblem({
    outer: [
      [0, 0],
      [5, 5],
      [0, 5],
      [5, 0],
    ],
    holes: [],
  }),
);
assert(
  polygonProblem({
    outer: [
      [0, 0],
      [5, 0],
      [5, 5],
      [0, 5],
    ],
    holes: [
      [
        [6, 6],
        [7, 6],
        [7, 7],
      ],
    ],
  }),
);
assert.equal(
  polygonProblem({
    outer: [
      [0, 0],
      [5, 0],
      [5, 5],
      [0, 5],
    ],
    holes: [
      [
        [1, 1],
        [2, 1],
        [2, 2],
        [1, 2],
      ],
    ],
  }),
  null,
);

const seed = {
  projectId: "test",
  width: 1000,
  height: 800,
  scale: "test",
  levels: [{ id: "ground", name: "Ground", elevation: 0 }],
  rooms: [],
  walls: [],
  doors: [],
  windows: [],
  columns: [],
  materials: [],
  seismic: {},
};
const source = {
  ...seed,
  calibration: {
    metersPerUnit: 0.01,
    referencePoints: [
      [0, 0],
      [100, 0],
    ],
    referenceDistanceM: 1,
  },
  walls: rectangle.map((w, i) => ({
    id: "wall" + i,
    levelId: "ground",
    start: w.start.map((n) => n * 100),
    end: w.end.map((n) => n * 100),
    thickness: 20,
    height: 3,
  })),
};
const cad = {
  sourceName: "test.dwg",
  unitConfirmed: true,
  metersPerCadUnit: 1,
  entities: [],
  layers: [],
  regions: [
    {
      id: "r",
      enabled: true,
      viewType: "plan",
      repeat: 1,
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 8,
      elevation: 0,
      name: "Ground",
    },
  ],
  bounds: { minX: 0, minY: 0, maxX: 10, maxY: 8 },
  skipped: {},
};
const rasterGraph = canonicalFromBlueprint(source);
validateCanonicalGraph(rasterGraph);
const cadGraph = canonicalFromBlueprint({ ...source, cad });
assert.deepEqual(
  rasterGraph.elements.map((e) => e.axis),
  cadGraph.elements.map((e) => e.axis),
  "equivalent calibrated geometry converges across source formats",
);
assert.deepEqual(
  canonicalRenderBlueprint(rasterGraph, source).walls,
  source.walls,
  "metric Z-up adapter round-trips legacy coordinates and IDs",
);
assert.equal(
  rasterGraph.elements[0].sections[0].height.confidence,
  null,
  "heuristic values are not calibrated confidence",
);
assert.equal(
  rasterGraph.elements[0].sections[0].height.source,
  "inferred_fallback",
);
const referenced = {
  ...source,
  sheets: [
    {
      id: "schedule",
      sourceName: "cuadro.pdf",
      viewType: "schedule",
      levelId: "ground",
    },
  ],
  correspondences: [
    {
      id: "link",
      targetId: "wall0",
      property: "height",
      valueM: 3,
      source: { kind: "sheet", viewId: "schedule", textId: "height-1" },
    },
  ],
};
assert.equal(
  canonicalFromBlueprint(referenced).elements[0].sections[0].height.source,
  "inferred_fallback",
  "stored assertion alone is not verified evidence",
);
assert.equal(
  canonicalFromBlueprint(referenced, ["link"]).elements[0].sections[0].height
    .source,
  "schedule_table",
  "only applied correspondences are promoted to confirmed dimensional evidence",
);
const named = canonicalFromBlueprint({
  ...source,
  rooms: [
    {
      id: "room",
      levelId: "ground",
      name: "Estudio",
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
      area: 80,
    },
  ],
});
const space = named.elements.find((e) => e.kind === "space");
assert(space.boundaryFaceId);
assert.equal(space.footprint.outer.length, 4);
const invalid = canonicalFromBlueprint({
  ...source,
  doors: [
    { id: "bad", levelId: "ground", wallId: "other", x: 10, y: 0, width: 90 },
  ],
});
assert(invalid.issues.some((i) => i.code === "missing-host"));
assert.throws(() => canonicalRenderBlueprint(invalid, source), /conflictos/);
const overlapping = canonicalFromBlueprint({
  ...source,
  doors: [
    {
      id: "a",
      wallId: "wall0",
      x: 300,
      y: 0,
      width: 90,
      height: 2,
      sillHeight: 0,
    },
    {
      id: "b",
      wallId: "wall0",
      x: 320,
      y: 0,
      width: 90,
      height: 2,
      sillHeight: 0,
    },
  ],
});
assert(overlapping.issues.some((i) => i.code === "opening-overlap"));
const broken = structuredClone(rasterGraph);
broken.levels[0].topology.halfEdges[0].twin = "missing";
assert.throws(() => validateCanonicalGraph(broken), /semiaristas/);
const confidence = structuredClone(rasterGraph);
confidence.elements[0].sections[0].height.confidence = 0.9;
assert.throws(() => validateCanonicalGraph(confidence), /calibración/);
assert.equal(preparationReport(seed).state, "UNINITIALIZED");
assert.equal(
  preparationReport({ ...source, cad: { ...cad, unitConfirmed: false } }).state,
  "AWAITING_UNITS",
);
assert.equal(
  preparationReport({ ...source, cad: { ...cad, regions: [] } }).state,
  "AWAITING_FLOOR_SELECTION",
);
assert.equal(preparationReport(source).state, "READY_TO_RECONSTRUCT");
assert.equal(preparationReport(source, rasterGraph).state, "RECONSTRUCTED");
assert.equal(preparationReport(source, invalid).state, "NEEDS_REVIEW");

const tiles = [...rasterTiles(2400, 800)];
assert.equal(tiles[0].x, 0);
assert.equal(tiles.at(-1).x + tiles.at(-1).width, 2400);
for (let i = 1; i < tiles.length; i++)
  assert(
    tiles[i - 1].x + tiles[i - 1].width - tiles[i].x >= 1024 * 0.2,
    "at least 20% overlap",
  );
const wall = (a, b, id = "w") => ({
  id,
  start: a,
  end: b,
  height: 3,
  thickness: 8,
});
assert.equal(
  fuseRasterWalls([wall([0, 0], [100, 0]), wall([60, 0], [160, 0])]).length,
  1,
);
assert.equal(
  fuseRasterWalls([wall([0, 0], [100, 0]), wall([105, 0], [160, 0])]).length,
  2,
  "real opening is never filled by tile fusion",
);
assert.equal(
  fuseRasterWalls([wall([0, 0], [100, 0]), wall([0, 4], [100, 4])]).length,
  2,
  "parallel walls stay separate",
);
const detected = await detectTiledRaster(2400, 800, async (tile) => {
  const pixels = new Uint8ClampedArray(tile.width * tile.height * 4).fill(255);
  for (let y = 0; y < tile.height; y++)
    for (let x = 0; x < tile.width; x++) {
      const gx = x + tile.x,
        gy = y + tile.y;
      if (
        (gx >= 60 &&
          gx < 2340 &&
          ((gy >= 60 && gy < 68) || (gy >= 730 && gy < 738))) ||
        (gy >= 60 &&
          gy < 738 &&
          ((gx >= 60 && gx < 68) || (gx >= 2332 && gx < 2340)))
      ) {
        const at = (y * tile.width + x) * 4;
        pixels[at] = pixels[at + 1] = pixels[at + 2] = 0;
      }
    }
  return pixels;
});
assert.equal(
  detected.walls.length,
  4,
  "tile seams preserve one continuous wall instance",
);
assert(detected.walls.some((w) => Math.abs(w.end[0] - w.start[0]) > 2200));
const many = new Uint8ClampedArray(1000 * 1680 * 4).fill(255);
for (let row = 0; row < 420; row++)
  for (let y = row * 4; y < row * 4 + 2; y++)
    for (let x = 50; x < 950; x++) {
      const at = (y * 1000 + x) * 4;
      many[at] = many[at + 1] = many[at + 2] = 0;
    }
assert.equal(
  detectPlanLines(many, 1000, 1680).length,
  420,
  "more than 400 raster walls are not silently dropped",
);
const thickCorners = new Uint8ClampedArray(1024 * 1024 * 4).fill(255);
for (let y = 100; y < 924; y++)
  for (let x = 100; x < 924; x++)
    if (x < 122 || x >= 902 || y < 122 || y >= 902) {
      const at = (y * 1024 + x) * 4;
      thickCorners[at] = thickCorners[at + 1] = thickCorners[at + 2] = 0;
    }
assert.equal(
  detectPlanLines(thickCorners, 1024, 1024).length,
  4,
  "thick L corners do not become short diagonal walls",
);
const controller = new AbortController();
controller.abort();
await assert.rejects(
  () =>
    detectTiledRaster(
      100,
      100,
      () => {
        throw Error("must not read");
      },
      { signal: controller.signal },
    ),
  /cancelado/,
);

// Geometric wall evidence works without meaningful layer or block names.
const shape = {
  ...cad,
  layers: [
    { name: "arbitrary-Q7", visible: true, count: 8, role: "reference" },
  ],
  entities: [...ring(0, 0, 10, 8, "o"), ...ring(0.2, 0.2, 9.8, 7.8, "i")].map(
    (s, i) => ({
      id: `e${i}`,
      kind: "path",
      points: [...s.start, ...s.end],
      closed: false,
      layer: "arbitrary-Q7",
      color: "#000",
    }),
  ),
};
assert(cadGeometricProposals(shape).some((p) => p.role === "wall"));
const manualShape = structuredClone(shape);
manualShape.entities[0].role = "reference";
manualShape.entities[0].roleSource = "manual";
applyCadGeometricProposals(manualShape);
assert.equal(
  manualShape.entities[0].role,
  "reference",
  "manual entity role survives geometry reclassification",
);
assert(
  manualShape.entities.some(
    (e) => e.role === "wall" && e.roleSource === "geometry",
  ),
);
for (const sweep of [Math.PI / 4, Math.PI / 2]) {
  const arcPoints = Array.from({ length: 17 }, (_, i) => [
    4 + 0.9 * Math.cos((sweep * i) / 16),
    0.1 + 0.9 * Math.sin((sweep * i) / 16),
  ]).flat();
  const arc = {
    id: "arc",
    kind: "path",
    points: arcPoints,
    closed: false,
    layer: "symbols-Q9",
    color: "#000",
  };
  const leaf = {
    id: "leaf",
    kind: "path",
    points: [4, 0.1, ...arcPoints.slice(-2)],
    closed: false,
    layer: "symbols-Q9",
    color: "#000",
  };
  const doors = cadGeometricProposals({
    ...shape,
    layers: [
      ...shape.layers,
      { name: "symbols-Q9", visible: true, count: 2, role: "reference" },
    ],
    entities: [...shape.entities, arc, leaf],
  });
  assert(
    doors.some((p) => p.role === "door" && p.signature === "hinge-leaf-swing"),
    "45/90 degree swing requires coupled leaf and structural support",
  );
}
assert.equal(
  cadGeometricProposals({
    ...shape,
    layers: [{ ...shape.layers[0], reviewed: true }],
  }).length,
  0,
  "confirmed mapping stays authoritative",
);
console.log(
  "Canonical graph, topology, high-resolution tiling and preparation checks passed.",
);

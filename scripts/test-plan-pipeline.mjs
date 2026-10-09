import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, ".."),
  nativeRequire = createRequire(import.meta.url),
  cache = new Map();
// Execute the actual TS domain/application code without generating files or loading React/Next.
function load(relative) {
  const filename = path.resolve(
    root,
    relative.endsWith(".ts") ? relative : relative + ".ts",
  );
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const require = (id) =>
    id.startsWith("@/")
      ? load("src/" + id.slice(2))
      : id.startsWith(".")
        ? load(path.resolve(path.dirname(filename), id))
        : nativeRequire(id);
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, {
    filename,
  })(require, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const base = "src/bounded-contexts/plan-digitization/";
const { detectPlanLines, findRectangularRooms, suggestRoomNames, suggestServicePoints, suggestOpeningsFromText, suggestStairsFromText } = load(
  base + "application/detect-plan-lines",
);
const { calibratePlan, synchronizePlanAreas } = load(
  base + "domain/plan-calibration",
);
const { reconcilePlanReview, mergeImportedReview, sheetReviewProgress, planElements, planTopologyIssues } = load(
  base + "domain/plan-review",
);
const { validateSharedBlueprint } = load(base + "domain/blueprint-rules");
const { geometryOnLevel } = load(base + "domain/plan-levels");
const { sourceSheetForElement, hydrateLegacySheetProvenance, withoutSheetGeometry } = load(base + "domain/plan-provenance");
const { buildSceneModel } = load(
  "src/bounded-contexts/spatial-visualization/application/use-cases/build-scene-model",
);
const seed = {
  projectId: "unit-plan",
  width: 400,
  height: 320,
  scale: "legacy",
  levels: [{ id: "level-1", name: "One", elevation: 0 }],
  walls: [],
  rooms: [],
  doors: [],
  windows: [],
  columns: [],
  stairs: [],
  materials: [],
  seismic: {
    defaultIntensity: 1,
    defaultDuration: 10,
    defaultDirection: "X",
    maxDisplacement: 1,
    maxDrift: 1,
  },
};
const pixels = new Uint8ClampedArray(400 * 320 * 4).fill(255);
function rectangle(x, y, w, h) {
  for (let row = y; row < y + h; row++)
    for (let col = x; col < x + w; col++) {
      const i = (row * 400 + col) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
    }
}
rectangle(40, 30, 328, 8);
rectangle(40, 270, 328, 8);
rectangle(40, 30, 8, 248);
rectangle(360, 30, 8, 248);
const walls = detectPlanLines(pixels, 400, 320);
assert.equal(walls.length, 4, "four raster walls vectorized");
const rooms = findRectangularRooms(walls, 400, 320);
assert.equal(rooms.length, 1, "one closed rectangular room");
// Two separate enclosed spaces in one photograph must remain distinct.
const twoRoomsPixels = new Uint8ClampedArray(400 * 320 * 4).fill(255);
function drawInk(x, y, width, height) {
  for (let row = y; row < y + height; row++)
    for (let col = x; col < x + width; col++) {
      const index = (row * 400 + col) * 4;
      twoRoomsPixels[index] = twoRoomsPixels[index + 1] = twoRoomsPixels[index + 2] = 0;
    }
}
for (const left of [20, 220]) {
  drawInk(left, 30, 160, 8);
  drawInk(left, 270, 160, 8);
  drawInk(left, 30, 8, 248);
  drawInk(left + 152, 30, 8, 248);
}
assert.equal(findRectangularRooms(detectPlanLines(twoRoomsPixels, 400, 320), 400, 320).length, 2);
assert.equal(
  findRectangularRooms(walls.slice(1), 400, 320).length,
  0,
  "open region not invented as a room",
);
assert.equal(
  detectPlanLines(new Uint8ClampedArray(400 * 320 * 4).fill(255), 400, 320)
    .length,
  0,
);
assert.throws(() => detectPlanLines(new Uint8ClampedArray(1), 2000, 2000));
const calibrated = calibratePlan(
  { ...seed, walls, rooms },
  [
    [40, 30],
    [240, 30],
  ],
  10,
);
assert.equal(calibrated.calibration.metersPerUnit, 0.05);
assert.equal(
  calibrated.rooms[0].area,
  Number((rooms[0].width * rooms[0].height * 0.0025).toFixed(2)),
);
assert.throws(() =>
  calibratePlan(
    seed,
    [
      [1, 1],
      [1, 1],
    ],
    1,
  ),
);
assert.throws(() =>
  calibratePlan(
    seed,
    [
      [1, 1],
      [100, 1],
    ],
    NaN,
  ),
);
assert.throws(() =>
  calibratePlan(
    seed,
    [
      [1, 1],
      [100, 1],
    ],
    -1,
  ),
);
const doubled = synchronizePlanAreas({
  ...calibrated,
  rooms: [{ ...rooms[0], width: rooms[0].width * 2 }],
});
assert.equal(
  doubled.rooms[0].area,
  Number((calibrated.rooms[0].area * 2).toFixed(2)),
);
const text = [
  {
    text: "COCINA",
    x: 100,
    y: 90,
    width: 100,
    height: 20,
    confidence: 90,
    source: "ocr",
  },
];
assert.equal(suggestRoomNames(rooms, text)[0].name, "COCINA");
assert.notEqual(
  suggestRoomNames(rooms, [{ ...text[0], confidence: 20 }])[0].name,
  "COCINA",
);
const electricalLabel = [{ ...text[0], text: "Tomacorriente", confidence: 90 }];
assert.equal(suggestServicePoints(electricalLabel, "electrical", "level-1", 400, 320)[0].kind, "outlet");
assert.equal(suggestServicePoints(electricalLabel, "plumbing", "level-1", 400, 320).length, 0);
assert.equal(suggestServicePoints([{ ...electricalLabel[0], confidence: 30 }], "electrical", "level-1", 400, 320).length, 0);
assert.equal(suggestServicePoints([{ ...text[0], text: "Desagüe" }], "plumbing", "level-1", 400, 320)[0].kind, "drain");
const annotationWall = { id: "wall-label", levelId: "level-1", start: [40, 80], end: [360, 80], thickness: 8, height: 2.8 };
const doorLabel = [{ ...text[0], text: "Puerta", x: 145, y: 60, width: 45, height: 18 }];
const openingProposal = suggestOpeningsFromText(doorLabel, [annotationWall], "level-1", 0.01);
assert.equal(openingProposal.doors.length, 1);
assert.equal(openingProposal.doors[0].wallId, annotationWall.id);
assert.equal(suggestOpeningsFromText([{ ...doorLabel[0], y: 200 }], [annotationWall], "level-1", 0.01).doors.length, 0,
  "a distant label cannot invent a door");
assert.equal(suggestOpeningsFromText([{ ...doorLabel[0], confidence: 40 }], [annotationWall], "level-1", 0.01).doors.length, 0);
const flight = suggestStairsFromText([{ ...text[0], text: "Escalera", confidence: 88 }], "level-1", 0.01, 400, 320);
assert.equal(flight[0].type, "straight");
assert(flight[0].length > flight[0].radius * 2);
validateSharedBlueprint({ ...seed, stairs: flight });
assert.throws(() => validateSharedBlueprint({ ...seed, stairs: [{ ...flight[0], length: -5 }] }),
  "a straight flight requires positive run length");
assert.equal(suggestStairsFromText([{ ...text[0], text: "Escalera caracol", confidence: 88 }], "level-1", 0.01, 400, 320)[0].type, "spiral");
assert.equal(suggestStairsFromText([{ ...text[0], text: "Escalera", confidence: 20 }], "level-1", 0.01, 400, 320).length, 0);
const slopedPixels = new Uint8ClampedArray(400 * 320 * 4).fill(255);
for (let x = 50; x < 220; x++) for (let offset = 0; offset < 5; offset++) {
  const y = x + offset;
  const i = (y * 400 + x) * 4;
  slopedPixels[i] = slopedPixels[i + 1] = slopedPixels[i + 2] = 0;
}
assert(detectPlanLines(slopedPixels, 400, 320).some((wall) =>
  Math.abs(wall.end[0] - wall.start[0]) > 100 &&
  Math.abs(wall.end[1] - wall.start[1]) > 100), "45-degree wall proposal survives detection");
validateSharedBlueprint(calibrated);
const basementPlan = {
  ...calibrated,
  levels: [
    { id: "basement-1", name: "Sótano 1", elevation: -2.8 },
    { id: "level-1", name: "Piso 1", elevation: 0 },
  ],
  roofs: [{ id: "roof-terrace", levelId: "level-1", name: "Cubierta parcial", x: 40, y: 30, width: 100, depth: 80, thickness: 0.18, elevation: 2.8 }],
  services: [{ id: "service-light", levelId: "basement-1", kind: "light", name: "Luminaria", x: 80, y: 80 }],
};
validateSharedBlueprint(basementPlan);
assert.equal(geometryOnLevel(basementPlan, "basement-1").walls.length, 0, "legacy walls stay on ground floor");
assert.equal(geometryOnLevel(basementPlan, "basement-1").services.length, 1);
assert.equal(geometryOnLevel(basementPlan, "level-1").roofs.length, 1);
const routedPlan = {
  ...basementPlan,
  services: [
    { id: "service-a", levelId: "level-1", kind: "outlet", name: "Toma", x: 80, y: 80 },
    { id: "service-b", levelId: "level-1", kind: "panel", name: "Tablero", x: 180, y: 80 },
    { id: "service-c", levelId: "level-1", kind: "water", name: "Agua", x: 220, y: 80 },
  ],
  routes: [{ id: "route-one", levelId: "level-1", kind: "electrical", fromId: "service-a", toId: "service-b" }],
};
validateSharedBlueprint(routedPlan);
assert.equal(geometryOnLevel(routedPlan, "level-1").routes.length, 1);
assert.throws(() => validateSharedBlueprint({ ...routedPlan, routes: [
  { ...routedPlan.routes[0], toId: "service-c" },
] }), "electrical and plumbing points cannot share a route");
assert.throws(() => validateSharedBlueprint({ ...routedPlan, routes: [
  routedPlan.routes[0], { ...routedPlan.routes[0], id: "route-duplicate", fromId: "service-b", toId: "service-a" },
] }), "duplicate undirected service connections are rejected");
assert.throws(() => validateSharedBlueprint({ ...basementPlan, roofs: [{ ...basementPlan.roofs[0], levelId: "missing" }] }));
assert.throws(() => validateSharedBlueprint({ ...basementPlan, services: [{ ...basementPlan.services[0], kind: "invented" }] }));
assert(planTopologyIssues({ ...basementPlan, roofs: [{ ...basementPlan.roofs[0], x: 350 }] }).some((issue) => issue.includes("outside-sheet")));
assert.throws(() =>
  validateSharedBlueprint({
    ...calibrated,
    calibration: { ...calibrated.calibration, metersPerUnit: 4 },
  }),
);
const review = {
  sourceName: "test.png",
  page: 1,
  method: "local-lines-v1",
  status: "draft",
  reviewedIds: [],
  warnings: [],
  text,
};
const draft = { ...calibrated, review };
const accepted = reconcilePlanReview(draft, {
  ...draft,
  review: {
    ...review,
    reviewedIds: planElements(draft).map((item) => item.id),
  },
});
assert.equal(accepted.review.status, "reviewed");
validateSharedBlueprint(accepted);
const changed = reconcilePlanReview(accepted, {
  ...accepted,
  walls: accepted.walls.map((wall, index) =>
    index ? wall : { ...wall, height: 3 },
  ),
});
assert.equal(changed.review.status, "draft");
assert.equal(changed.review.reviewedIds.length, planElements(draft).length - 1);
const extraFloor = reconcilePlanReview(accepted, {
  ...accepted,
  levels: [...accepted.levels, { id: "level-2", name: "Floor 2", elevation: 2.8 }],
});
assert.deepEqual(extraFloor.review.reviewedIds, accepted.review.reviewedIds,
  "adding an empty level preserves decisions on existing levels");
const secondSheet = mergeImportedReview(accepted, {
  ...accepted,
  walls: [...accepted.walls, { ...accepted.walls[0], id: "wall-second-sheet" }],
  sheets: [{
    id: "sheet-second", name: "Second page", discipline: "architecture",
    levelId: "level-1", sourceName: "second.png", page: 2,
    image: "data:image/png;base64,AA==", x: 0, y: 0, width: 100,
    height: 100, metersPerUnit: 0.05,
    evidence: { method: review.method, warnings: ["orthogonal-baseline"], text },
  }],
}, { ...review, sourceName: "second.png", page: 2 });
assert.equal(secondSheet.review.sourceName, "second.png");
assert.equal(secondSheet.review.status, "draft");
assert.deepEqual(secondSheet.review.reviewedIds, accepted.review.reviewedIds,
  "importing another sheet preserves existing reviewed geometry");
assert.equal(mergeImportedReview(accepted, {
  ...accepted, walls: accepted.walls.slice(1),
}, review).review.reviewedIds.length, accepted.review.reviewedIds.length - 1,
"replaced geometry must not retain stale review IDs");
validateSharedBlueprint(secondSheet);
assert.equal(secondSheet.sheets[0].evidence.text.length, text.length,
  "OCR evidence stays attached to its source page");
const explicitWall = { ...secondSheet.walls[0], id: "wall-no-prefix", levelId: "level-1", sheetId: "sheet-second" };
const explicitPlan = { ...secondSheet, walls: [...secondSheet.walls, explicitWall] };
assert.equal(sourceSheetForElement(explicitPlan, explicitWall)?.id, "sheet-second",
  "source lookup uses the explicit relation, not element naming");
validateSharedBlueprint(explicitPlan);
assert.throws(() => validateSharedBlueprint({
  ...explicitPlan, walls: explicitPlan.walls.map((wall) => wall.id === explicitWall.id ?
    { ...wall, sheetId: "missing-sheet" } : wall),
}), "dangling source-sheet references are rejected");
assert.throws(() => validateSharedBlueprint({
  ...explicitPlan, walls: explicitPlan.walls.map((wall) => wall.id === explicitWall.id ?
    { ...wall, levelId: "level-2" } : wall),
  levels: [...explicitPlan.levels, { id: "level-2", name: "Floor 2", elevation: 2.8 }],
}), "an element cannot reference a sheet on a different level");
const legacySheet = { ...secondSheet.sheets[0], id: "deadbeef-legacy" };
const legacyWall = { ...secondSheet.walls[0], id: "wall-deadbeef-1", levelId: "level-1" };
const legacyPlan = { ...accepted, sheets: [legacySheet], walls: [legacyWall] };
assert.equal(sourceSheetForElement(legacyPlan, legacyWall)?.id, legacySheet.id);
assert.equal(hydrateLegacySheetProvenance(legacyPlan).walls[0].sheetId, legacySheet.id,
  "legacy imported IDs are linked in memory before a normal save");
assert.equal(sourceSheetForElement(legacyPlan, { ...legacyWall, id: "wall-manual" }), undefined,
  "manual geometry is never attributed to a source by guesswork");
const linkedPlan = {
  ...legacyPlan,
  walls: [legacyWall, { ...legacyWall, id: "wall-manual" }],
  doors: [{ id: "door-linked", wallId: legacyWall.id, x: 100, y: 30, width: 50, rotation: 0 }],
  review: { ...review, reviewedIds: [legacyWall.id] },
};
assert.deepEqual(sheetReviewProgress(linkedPlan, legacySheet.id), {
  total: 1, reviewed: 1, pending: [],
}, "sheet review uses only geometry linked to that page");
const clearedSheet = withoutSheetGeometry(linkedPlan, legacySheet.id);
assert.deepEqual(clearedSheet.walls.map((wall) => wall.id), ["wall-manual"]);
assert.equal(clearedSheet.doors.length, 0, "replacing a sheet removes openings on its removed walls");
assert.equal(clearedSheet.sheets.length, 1, "the stable sheet record remains for in-place replacement");
assert.equal(mergeImportedReview(linkedPlan, {
  ...clearedSheet, walls: [...clearedSheet.walls, legacyWall],
}, review, legacySheet.id).review.reviewedIds.length, 0,
"reimport never carries approval onto replacement geometry even if IDs recur");
assert.throws(() => validateSharedBlueprint({
  ...secondSheet,
  sheets: [{ ...secondSheet.sheets[0], evidence: {
    ...secondSheet.sheets[0].evidence,
    text: [{ ...text[0], confidence: 120 }],
  } }],
}), "invalid per-page OCR evidence is rejected by REST validation");
assert.throws(() =>
  validateSharedBlueprint({
    ...draft,
    review: { ...review, status: "reviewed" },
  }),
);
assert.throws(() =>
  validateSharedBlueprint({
    ...draft,
    review: { ...review, reviewedIds: ["level-1"] },
  }),
);
const scene = buildSceneModel.execute(calibrated);
assert.equal(scene.scale, 20);
assert(scene.width > 15 && scene.width < 17);
assert(
  scene.wallSegments.every(
    (wall) => Number.isFinite(wall.x) && wall.thickness === 0.4,
  ),
);
const emptyScene = buildSceneModel.execute(seed);
assert(Number.isFinite(emptyScene.width));
const invalidWall = {
  id: "wall-zero",
  start: [2, 2],
  end: [2, 2],
  thickness: 8,
  height: 2.8,
};
assert.equal(
  buildSceneModel.execute({ ...seed, walls: [invalidWall] }).wallSegments
    .length,
  0,
);
const straight = {
  ...seed,
  walls: [
    { id: "wall-one", start: [0, 0], end: [200, 0], thickness: 8, height: 3 },
  ],
};
const withWindow = {
  ...straight,
  windows: [
    {
      id: "window-one",
      wallId: "wall-one",
      x: 100,
      y: 12,
      width: 80,
      rotation: 90,
      height: 1.3,
      sillHeight: 0.8,
    },
  ],
};
assert.equal(
  planTopologyIssues(withWindow).length,
  1,
  "off-wall opening flagged",
);
const windowScene = buildSceneModel.execute(withWindow);
assert.equal(
  windowScene.openings[0].z,
  0,
  "opening projected onto owning wall",
);
assert.equal(windowScene.openings[0].height, 1.3);
assert(Math.abs(windowScene.openings[0].rotation) < 1e-9);
const overlaps = {
  ...straight,
  doors: [
    { id: "door-a", wallId: "wall-one", x: 90, y: 0, width: 80, rotation: 0 },
    { id: "door-b", wallId: "wall-one", x: 120, y: 0, width: 80, rotation: 0 },
  ],
};
assert(
  planTopologyIssues(overlaps).some((issue) => issue.includes("overlapping")),
);
assert(
  buildSceneModel
    .execute(overlaps)
    .wallSegments.every((wall) => wall.length > 0 && wall.height > 0),
);
for (const language of ["es", "en", "pt"]) {
  const translations = JSON.parse(
    fs.readFileSync(
      path.join(root, `public/i18n/plans/${language}.json`),
      "utf8",
    ),
  );
  const reference = JSON.parse(
    fs.readFileSync(path.join(root, "public/i18n/plans/es.json"), "utf8"),
  );
  assert.deepEqual(
    Object.keys(translations).sort(),
    Object.keys(reference).sort(),
  );
}
console.log(
  "PASS: raster vectorization, room topology, calibration, quantities, review invalidation, REST validation, 3D openings and i18n parity.",
);

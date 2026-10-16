import assert from "node:assert/strict";
import fs from "node:fs";
import { loadDomain } from "./lib/domain-loader.mjs";
const { FIXTURE_FAMILIES, familyForFixture, validFamilyAssignment } =
  loadDomain("src/bounded-contexts/plan-digitization/domain/fixture-families");
const { buildFixtureParts } = loadDomain(
  "src/bounded-contexts/spatial-visualization/application/fixture-parts",
);
const { canonicalFromBlueprint, canonicalRenderBlueprint } = loadDomain(
  "src/bounded-contexts/plan-digitization/domain/canonical/blueprint-adapter",
);
const { compileCadBlueprint } = loadDomain(
  "src/bounded-contexts/plan-digitization/domain/cad-operations",
);
const fixture = (kind) => ({
  id: "fixture",
  levelId: "ground",
  name: kind,
  kind,
  x: 100,
  y: 200,
  width: 60,
  depth: 90,
  height: 1,
  rotation: 0,
});
for (const family of FIXTURE_FAMILIES) {
  const item = fixture(family.kind),
    selection = { familyId: family.id, finish: "dark", elevationM: 0.35 };
  assert(validFamilyAssignment(selection));
  const batches = buildFixtureParts([item], 100, 200, 60, {
    fixture: selection,
  });
  const parts = batches.flatMap((b) => b.parts);
  assert(
    parts.length > 0 && parts.length <= 24,
    family.id + " bounded assembly",
  );
  for (const p of parts) {
    assert(
      [p.x, p.y, p.z, p.width, p.height, p.depth, p.rotation].every(
        Number.isFinite,
      ),
    );
    assert(Math.min(p.width, p.height, p.depth) > 0);
    assert(
      Math.abs(p.x) + p.width / 2 <= 0.500001,
      family.id + " width preserves source footprint",
    );
    assert(
      Math.abs(p.z) + p.depth / 2 <= 0.750001,
      family.id + " depth preserves source footprint",
    );
    assert(
      p.y - p.height / 2 >= 0.349999 && p.y + p.height / 2 <= 1.350001,
      family.id + " height and elevation",
    );
    assert.equal(
      p.id,
      item.id,
      "all surfaces stay selectable as the source element",
    );
  }
}
const item = fixture("chair");
const carParts=buildFixtureParts([fixture('vehicle')],100,200,60);
assert(carParts.some(b=>b.finish==='metal'&&b.shape==='sphere'),'Car body has a rounded generic silhouette rather than one full-footprint block');
assert(carParts.some(b=>b.finish==='glass')&&carParts.some(b=>b.finish==='ceramic'),'Car cabin and headlights are distinct, batched parts');
assert.equal(carParts.find(b=>b.finish==='dark'&&b.shape==='sphere').parts.length,4,'Four wheels retain the same selectable vehicle ID');
const sanitary = buildFixtureParts([fixture("toilet")], 100, 200, 60, {
  fixture: { familyId: "toilet-floor", finish: "dark", elevationM: 0 },
});
assert(
  sanitary.some((b) => b.shape === "basin") &&
    sanitary.some((b) => b.shape === "ring"),
  "toilet bowl and seat remain hollow primitives",
);
assert(
  sanitary
    .find((b) => b.finish === "ceramic")
    .parts.every((p) => p.tint === "#394449"),
  "chosen finish also applies to sanitary families",
);
assert.equal(
  familyForFixture({ ...item, name: "Butaca de auditorio" }).id,
  "chair-auditorium",
);
assert.equal(
  familyForFixture({ ...item, name: "Lavabo suspendido" }).id,
  "chair-standard",
  "name hints cannot switch the recognized category",
);
const repeated = Array.from({ length: 500 }, (_, i) => ({
  ...item,
  id: "chair-" + i,
  x: 100 + i * 60,
}));
const batches = buildFixtureParts(repeated, 100, 200, 60);
assert(batches.length < 10, "500 chairs do not create 500 GPU batches");
assert(
  buildFixtureParts(repeated, 100, 200, 60, {}, "low").flatMap((b) => b.parts)
    .length < batches.flatMap((b) => b.parts).length,
);
assert.equal(
  familyForFixture(item, {
    fixture: { familyId: "sink-wall", finish: "natural", elevationM: 2 },
  }).id,
  "chair-standard",
);
assert.equal(buildFixtureParts([{ ...item, width: NaN }], 0, 0, 60).length, 0);
assert.equal(buildFixtureParts([item], 0, 0, 0).length, 0);
const turned = buildFixtureParts(
  [{ ...item, rotation: 90 }],
  100,
  200,
  60,
).flatMap((b) => b.parts);
const flat = batches.flatMap((b) => b.parts).filter((p) => p.id === "chair-0");
for (let i = 0; i < turned.length; i++) {
  assert(Math.abs(turned[i].x + flat[i].z) < 1e-8);
  assert(Math.abs(turned[i].z - flat[i].x) < 1e-8);
}
const plan = {
  projectId: "families",
  width: 600,
  height: 600,
  scale: "metric",
  levels: [{ id: "ground", name: "Planta baja", elevation: 0 }],
  rooms: [],
  walls: [],
  doors: [],
  windows: [],
  columns: [],
  fixtures: [item],
  calibration: { metersPerUnit: 1 / 60 },
  fixtureFamilies: {
    fixture: { familyId: "chair-auditorium", finish: "dark", elevationM: 0.2 },
  },
};
const graph = canonicalFromBlueprint(plan),
  furniture = graph.elements.find((e) => e.kind === "furniture");
assert.equal(furniture.catalogId, "chair-auditorium");
assert.equal(
  furniture.status,
  "proposed",
  "family choice must not confirm recognition",
);
assert.deepEqual(furniture.representation, plan.fixtureFamilies.fixture);
assert.deepEqual(
  canonicalRenderBlueprint(graph, plan).fixtureFamilies,
  plan.fixtureFamilies,
);
// Empty CAD rebuilding may remove a detection but must retain the user's reusable representation choices.
const rebuilt = compileCadBlueprint(plan, {
  sourceName: "test",
  entities: [],
  layers: [],
  regions: [],
  metersPerCadUnit: 1,
  unitConfirmed: true,
});
assert.deepEqual(rebuilt.fixtureFamilies, plan.fixtureFamilies);
const backend = new URL(
  "../../teluria-backend/src/modules/plan-digitization/domain/fixture-families.js",
  import.meta.url,
);
if (fs.existsSync(backend)) {
  const { FIXTURE_FAMILY_KINDS } = await import(backend.href);
  assert.deepEqual(
    Object.fromEntries(FIXTURE_FAMILIES.map((f) => [f.id, f.kind])),
    FIXTURE_FAMILY_KINDS,
    "frontend and backend family contracts match",
  );
}
console.log(
  `${FIXTURE_FAMILIES.length} families: metric bounds, rotations, hollow shapes, selection, bounded batches, low detail, persistence and canonical export verified.`,
);

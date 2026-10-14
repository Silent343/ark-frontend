import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  sha256,
  inventory,
  referenceIndex,
  resolveSelectedReference,
  classHint,
  unitEvidence,
  blockProposals,
  entityBounds,
} from "./lib/corpus-audit.mjs";
assert.equal(classHint("a_TABIQ_5"), "wall");
assert.equal(classHint("BASE$0$a_VENT"), "window");
assert.equal(classHint("HC_Dining Chairs - Level 0"), "chair");
assert.equal(classHint("EST-EJES DE VIGUETAS"), null);
assert.equal(classHint("LEYENDA RED AGUA"), null);
assert.equal(classHint("a_DEMOLER muro"), null);
assert.equal(classHint("PUESTA A TIERRA$0$Tableros y Gabinete"), "panel");
assert.equal(
  classHint("EST-ACERO"),
  null,
  "Steel drafting layer is not a whole structural object.",
);
assert.equal(classHint("VIGUETAS"), "joist");
assert.equal(classHint("1-MEP-BLOCK VALVULA BOLA"), "valve");
assert.equal(unitEvidence(0).suggestedMetresPerUnit, null);
assert.equal(unitEvidence(4).suggestedMetresPerUnit, 0.001);
assert.equal(unitEvidence(6).confirmed, false);
const hash = "a".repeat(64),
  otherHash = "b".repeat(64);
const index = referenceIndex([
  { name: "BASE.dwg", hash },
  { name: "base.dwg", hash },
]);
assert.equal(resolveSelectedReference(index, "..\\BASE.dwg").hash, hash);
assert.equal(
  resolveSelectedReference(
    referenceIndex([
      { name: "BASE.dwg", hash },
      { name: "base.dwg", hash: otherHash },
    ]),
    "BASE.dwg",
  ),
  undefined,
);
const source = [
  {
    id: "e1",
    group: "g",
    blockName: "Silla",
    layer: "furn",
    color: "#234",
    kind: "path",
    points: [0, 0, 2, 3],
    closed: false,
  },
];
const proposals = blockProposals(source);
assert.equal(proposals.length, 1);
assert.equal(proposals[0].reviewed, false);
assert.equal(proposals[0].status, "proposed");
assert.deepEqual(entityBounds(source[0]), [0, 0, 2, 3]);
assert.equal(
  blockProposals([{ ...source[0], blockName: "LEYENDA AGUA" }]).length,
  0,
);
const root = fs.mkdtempSync(path.resolve(".data/qa/corpus-test-"));
fs.writeFileSync(
  path.join(root, "sample.dwg"),
  "AC1027 test fixture (not an actual drawing)",
);
const files = inventory([root, path.join(root, "sample.dwg")]);
assert.equal(files.length, 1);
assert.equal(files[0].hash, sha256(fs.readFileSync(files[0].path)));
const vector = { sourceHash: hash, bounds: [0, 0, 20, 20], shapes: source };
fs.writeFileSync(
  path.join(root, hash + ".vectors.json"),
  JSON.stringify(vector),
);
fs.writeFileSync(
  path.join(root, "audit.json"),
  JSON.stringify({
    rightsStatus: "unconfirmed",
    results: [
      {
        file: { name: "LCR_ARQ_PL_004_TEST.dwg", hash },
        status: "audited",
        afterEntities: 1,
        references: { unresolved: [], loaded: [] },
        skipped: {},
        layers: [{ name: "furn", visible: true }],
        header: { units: unitEvidence(0) },
      },
    ],
  }),
);
const run = spawnSync(
  process.execPath,
  ["scripts/prepare-cad-review-batch.mjs", "--audit", root],
  { encoding: "utf8" },
);
assert.equal(run.status, 0, run.stderr);
const batch = JSON.parse(
  fs.readFileSync(path.join(root, "review-batch.json"), "utf8"),
);
assert.equal(batch.trainingReady, false);
assert.equal(batch.tasks.length, 1);
assert.equal(batch.blocked.length, 6);
assert.equal(batch.tasks[0].reviewed, false);
assert.equal(batch.tasks[0].split, "unassigned");
assert.equal(batch.tasks[0].sourceGroup, null);
assert.equal(batch.tasks[0].proposals[0].reviewed, false);
assert.equal(batch.tasks[0].annotations.length, 0);
assert(
  fs
    .readFileSync(path.join(root, "revision.html"), "utf8")
    .includes('"schemaVersion":"ark-review-draft-1"'),
);
const overwrite = spawnSync(
  process.execPath,
  ["scripts/prepare-cad-review-batch.mjs", "--audit", root],
  { encoding: "utf8" },
);
assert.notEqual(
  overwrite.status,
  0,
  "An existing human batch must not be silently overwritten.",
);
fs.writeFileSync(
  path.join(root, "context.json"),
  JSON.stringify({
    schemaVersion: 1,
    sourceGroup: "synthetic-one-building",
    buildingGroupConfirmedBy: "user",
    permissions: { training: "user-attested", commercialUse: "not-assessed" },
  }),
);
const confirmedPath = path.join(root, "confirmed-context");
const confirmedRun = spawnSync(
  process.execPath,
  [
    "scripts/prepare-cad-review-batch.mjs",
    "--audit",
    root,
    "--out",
    confirmedPath,
  ],
  { encoding: "utf8" },
);
assert.equal(confirmedRun.status, 0, confirmedRun.stderr);
const confirmed = JSON.parse(
  fs.readFileSync(path.join(confirmedPath, "review-batch.json"), "utf8"),
);
assert.equal(confirmed.buildingGroupConfirmed, true);
assert.equal(confirmed.tasks[0].sourceGroup, "synthetic-one-building");
assert.equal(confirmed.tasks[0].split, "unassigned");
assert.equal(confirmed.trainingReady, false);
assert.equal(confirmed.independentlyReviewed, false);
console.log(
  JSON.stringify({
    passed: true,
    fixtureDirectory: root,
    checks:
      "unit evidence, conservative hints, ambiguous references, proposals not truth, private batch, missing disciplines, overwrite protection",
  }),
);

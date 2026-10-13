import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDetections, matchBoxes } from "./lib/detection-evaluation.mjs";
const object = (id, c, bbox = [0, 0, 2, 2], hostId) => ({
  id,
  class: c,
  bbox,
  ...(hostId ? { hostId } : {}),
});
const sample = (id, objects) => ({
  id,
  units: "m",
  coordinateFrame: "project-xy",
  objects,
});
const truth = (objects) => ({
  schemaVersion: 1,
  datasetId: "synthetic-protocol-tests",
  version: "1",
  samples: [
    {
      ...sample("drawing", objects),
      sourceGroup: "building-a",
      split: "test",
      exhaustiveClasses: ["wall", "door", "window"],
      annotator: "test-fixture",
      reviewed: true,
    },
  ],
});
const predictions = (objects) => ({
  schemaVersion: 1,
  detector: { id: "synthetic", version: "1" },
  samples: [sample("drawing", objects)],
});
test("duplicates, omitted classes and wrong classes produce FP/FN instead of inflated accuracy", () => {
  const r = evaluateDetections(
    truth([object("t", "door")]),
    predictions([
      object("a", "door"),
      object("b", "door"),
      object("c", "window"),
    ]),
  );
  assert.deepEqual(r.micro, {
    tp: 1,
    fp: 2,
    fn: 0,
    precision: 1 / 3,
    recall: 1,
    f1: 0.5,
  });
  assert.equal(r.perClass.wall.recall, null);
});
test("augmenting paths find two valid matches where greedy highest-IoU gives one", () => {
  const t = [
    object("t1", "wall", [0, 0, 2, 1]),
    object("t2", "wall", [1, 0, 3, 1]),
  ];
  const p = [
    object("a", "wall", [0.5, 0, 2.5, 1]),
    object("b", "wall", [0, 0, 1.5, 1]),
  ];
  assert.equal(matchBoxes(t, p, 0.5).length, 2);
});
test("host association uses matched host identity, not merely existing wall IDs", () => {
  const t = truth([
    object("wall", "wall"),
    object("door", "door", [0, 0, 1, 1], "wall"),
  ]);
  const p = predictions([
    object("w", "wall"),
    object("d", "door", [0, 0, 1, 1], "w"),
  ]);
  assert.equal(evaluateDetections(t, p).hostAssociation.accuracy, 1);
  p.samples[0].objects.push(object("wrong", "wall", [3, 0, 5, 2]));
  p.samples[0].objects[1].hostId = "wrong";
  assert.equal(evaluateDetections(t, p).hostAssociation.accuracy, 0);
});
test("missing test predictions count as omissions; partial annotation is explicit", () => {
  const t = truth([object("door", "door")]);
  t.samples.push({ ...t.samples[0], id: "other" });
  const r = evaluateDetections(t, predictions([]));
  assert.equal(r.micro.fn, 2);
  assert.equal(r.samples[1].missingPredictions, true);
  const p = predictions([object("table", "table")]);
  assert.equal(evaluateDetections(t, p).ignoredPredictions, 1);
});
test("reject leakage between train/test, invented samples, missing review and malformed boxes", () => {
  const t = truth([object("door", "door")]);
  t.samples.push({ ...t.samples[0], id: "training", split: "train" });
  assert.throws(() => evaluateDetections(t, predictions([])), /leakage/);
  for (const mutate of [
    (t) => {
      t.samples[0].reviewed = false;
    },
    (t) => {
      t.samples[0].units = "px";
    },
    (t) => {
      t.samples[0].objects[0].bbox = [0, 0, 0, 1];
    },
  ]) {
    const candidate = truth([object("door", "door")]);
    mutate(candidate);
    assert.throws(() => evaluateDetections(candidate, predictions([])));
  }
  const p = predictions([]);
  p.samples[0].id = "invented";
  assert.throws(() => evaluateDetections(truth([]), p));
});
test("source hashes guard original-file identity and empty inference remains measurable", () => {
  const t = truth([object("door", "door")]);
  t.samples[0].sourceHash = "a".repeat(64);
  const p = predictions([object("d", "door")]);
  p.samples[0].sourceHash = "b".repeat(64);
  assert.throws(() => evaluateDetections(t, p), /different source/);
  p.samples[0].sourceHash = t.samples[0].sourceHash;
  assert.equal(evaluateDetections(t, p).micro.tp, 1);
  p.samples = [];
  assert.equal(evaluateDetections(t, p).micro.fn, 1);
});

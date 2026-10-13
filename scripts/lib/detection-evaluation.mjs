/** Reproducible fixed-threshold AABB evaluation. No dependencies and no fabricated annotations. */
export const detectionClasses = [
  "wall",
  "door",
  "window",
  "column",
  "stair",
  "room",
  "slab",
  "roof",
  "fixture",
  "chair",
  "table",
  "bed",
  "sofa",
  "toilet",
  "sink",
  "cabinet",
  "equipment",
  "plant",
  "vehicle",
  "outlet",
  "switch",
  "light",
  "panel",
  "water",
  "drain",
];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const text = (s) => typeof s === "string" && s.length > 0 && s.length <= 200;
export function boxIoU(a, b) {
  const area = (p) => (p[2] - p[0]) * (p[3] - p[1]);
  const overlap =
    Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return overlap / (area(a) + area(b) - overlap);
}
function validateSamples(samples, truth) {
  assert(
    Array.isArray(samples) &&
      (!truth || samples.length > 0) &&
      samples.length <= 2000,
    "Expected at most 2000 samples and nonempty ground truth.",
  );
  const ids = new Set(),
    groups = new Map();
  for (const s of samples) {
    assert(
      s?.sourceHash === undefined ||
        (typeof s.sourceHash === "string" &&
          /^[a-f0-9]{64}$/.test(s.sourceHash)),
      "Invalid source SHA-256.",
    );
    assert(s && text(s.id) && !ids.has(s.id), "Missing/duplicate sample ID.");
    ids.add(s.id);
    assert(
      s.units === "m" && s.coordinateFrame === "project-xy",
      "Every sample must use metres in project-xy coordinates.",
    );
    assert(
      Array.isArray(s.objects) && s.objects.length <= 10000,
      "Too many objects in sample.",
    );
    if (truth) {
      assert(
        text(s.sourceGroup) &&
          ["train", "validation", "test"].includes(s.split),
        "Truth needs sourceGroup and split.",
      );
      assert(
        !groups.has(s.sourceGroup) || groups.get(s.sourceGroup) === s.split,
        "Dataset leakage: the same building/sourceGroup occurs in different splits.",
      );
      groups.set(s.sourceGroup, s.split);
      assert(
        Array.isArray(s.exhaustiveClasses) &&
          s.exhaustiveClasses.length > 0 &&
          new Set(s.exhaustiveClasses).size === s.exhaustiveClasses.length &&
          s.exhaustiveClasses.every((c) => detectionClasses.includes(c)),
        "Declare classes exhaustively annotated in each sample.",
      );
      assert(
        text(s.annotator) && s.reviewed === true,
        "Truth must identify an annotator and be marked reviewed.",
      );
    }
    const objectIds = new Set(),
      counts = new Map();
    for (const o of s.objects) {
      assert(
        o &&
          text(o.id) &&
          !objectIds.has(o.id) &&
          detectionClasses.includes(o.class),
        "Invalid/duplicate object or unsupported class.",
      );
      objectIds.add(o.id);
      assert(
        Array.isArray(o.bbox) &&
          o.bbox.length === 4 &&
          o.bbox.every((v) => Number.isFinite(v) && Math.abs(v) <= 100000) &&
          o.bbox[2] > o.bbox[0] &&
          o.bbox[3] > o.bbox[1],
        "Invalid metric bounding box.",
      );
      assert(
        o.hostId === undefined || text(o.hostId),
        "Invalid host reference.",
      );
      if (truth)
        assert(
          s.exhaustiveClasses.includes(o.class),
          "Truth contains objects outside its declared annotated classes.",
        );
      counts.set(o.class, (counts.get(o.class) ?? 0) + 1);
      assert(
        counts.get(o.class) <= 1000,
        "Split large views: at most 1000 objects per class/sample.",
      );
    }
    for (const o of s.objects)
      if (truth && o.hostId !== undefined) {
        const host = s.objects.find((t) => t.id === o.hostId);
        assert(
          host?.class === "wall" && ["door", "window"].includes(o.class),
          "Host must reference an existing wall in the same sample.",
        );
      }
  }
}

/** Maximum-cardinality one-to-one matching; duplicate predictions cannot inflate true positives. */
export function matchBoxes(truth, predicted, threshold) {
  const ordered = [...predicted].sort((a, b) => a.id.localeCompare(b.id));
  const edges = ordered.map((p) =>
    truth
      .map((t, i) => ({ i, overlap: boxIoU(t.bbox, p.bbox) }))
      .filter((e) => e.overlap >= threshold)
      .sort(
        (a, b) =>
          b.overlap - a.overlap || truth[a.i].id.localeCompare(truth[b.i].id),
      ),
  );
  const owners = new Map();
  function assign(index, visited) {
    for (const { i } of edges[index]) {
      if (visited.has(i)) continue;
      visited.add(i);
      if (!owners.has(i) || assign(owners.get(i), visited)) {
        owners.set(i, index);
        return true;
      }
    }
    return false;
  }
  for (let i = 0; i < ordered.length; i++) assign(i, new Set());
  return [...owners].map(([i, p]) => ({
    truthId: truth[i].id,
    predictionId: ordered[p].id,
    iou: boxIoU(truth[i].bbox, ordered[p].bbox),
  }));
}
const metrics = (tp, fp, fn) => ({
  tp,
  fp,
  fn,
  precision: tp + fp ? tp / (tp + fp) : null,
  recall: tp + fn ? tp / (tp + fn) : null,
  f1: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : null,
});

export function evaluateDetections(
  truth,
  predictions,
  { split = "test", iou = 0.5 } = {},
) {
  assert(
    truth?.schemaVersion === 1 && text(truth.datasetId) && text(truth.version),
    "Ground truth requires schemaVersion 1, datasetId and version.",
  );
  assert(
    predictions?.schemaVersion === 1 &&
      text(predictions.detector?.id) &&
      text(predictions.detector?.version),
    "Predictions require schemaVersion 1 and detector id/version.",
  );
  assert(
    ["train", "validation", "test"].includes(split) &&
      Number.isFinite(iou) &&
      iou > 0 &&
      iou <= 1,
    "Invalid split or IoU threshold.",
  );
  validateSamples(truth.samples, true);
  validateSamples(predictions.samples, false);
  const actual = truth.samples.filter((s) => s.split === split);
  assert(actual.length > 0, "Requested split has no reviewed samples.");
  const allIds = new Set(truth.samples.map((s) => s.id));
  assert(
    predictions.samples.every((s) => allIds.has(s.id)),
    "Prediction sample does not exist in the truth dataset.",
  );
  const byId = new Map(predictions.samples.map((s) => [s.id, s]));
  const totals = new Map(),
    sampleReports = [];
  let hostCorrect = 0,
    hostEvaluated = 0,
    totalIgnored = 0;
  for (const s of actual) {
    assert(
      !s.sourceHash ||
        !byId.has(s.id) ||
        byId.get(s.id).sourceHash === s.sourceHash,
      "Prediction was generated from a different source file.",
    );
    const predicted = byId.get(s.id)?.objects ?? [],
      matches = [];
    const perClass = {};
    for (const c of s.exhaustiveClasses) {
      const t = s.objects.filter((o) => o.class === c),
        p = predicted.filter((o) => o.class === c);
      const found = matchBoxes(t, p, iou);
      matches.push(...found);
      const counts = metrics(
        found.length,
        p.length - found.length,
        t.length - found.length,
      );
      perClass[c] = counts;
      const sum = totals.get(c) ?? { tp: 0, fp: 0, fn: 0, ious: [] };
      sum.tp += counts.tp;
      sum.fp += counts.fp;
      sum.fn += counts.fn;
      sum.ious.push(...found.map((m) => m.iou));
      totals.set(c, sum);
    }
    const mapping = new Map(matches.map((m) => [m.predictionId, m.truthId]));
    for (const m of matches) {
      const t = s.objects.find((o) => o.id === m.truthId),
        p = predicted.find((o) => o.id === m.predictionId);
      if (t.hostId !== undefined) {
        hostEvaluated++;
        if (p.hostId && mapping.get(p.hostId) === t.hostId) hostCorrect++;
      }
    }
    const ignored = predicted.filter(
      (o) => !s.exhaustiveClasses.includes(o.class),
    ).length;
    totalIgnored += ignored;
    sampleReports.push({
      id: s.id,
      sourceGroup: s.sourceGroup,
      missingPredictions: !byId.has(s.id),
      ignoredPredictions: ignored,
      perClass,
      matches,
      falseNegatives: s.objects
        .filter((o) => !matches.some((m) => m.truthId === o.id))
        .map((o) => o.id),
      falsePositives: predicted
        .filter(
          (o) => s.exhaustiveClasses.includes(o.class) && !mapping.has(o.id),
        )
        .map((o) => o.id),
    });
  }
  const perClass = Object.fromEntries(
    [...totals].map(([c, t]) => [
      c,
      {
        ...metrics(t.tp, t.fp, t.fn),
        meanMatchedIoU: t.ious.length
          ? t.ious.reduce((a, b) => a + b, 0) / t.ious.length
          : null,
      },
    ]),
  );
  const sums = [...totals.values()].reduce(
    (a, b) => ({ tp: a.tp + b.tp, fp: a.fp + b.fp, fn: a.fn + b.fn }),
    { tp: 0, fp: 0, fn: 0 },
  );
  return {
    schemaVersion: 1,
    dataset: { id: truth.datasetId, version: truth.version },
    detector: predictions.detector,
    split,
    iouThreshold: iou,
    protocol:
      "class-aware maximum-cardinality matching of metric 2D axis-aligned boxes; fixed operating point",
    samplesEvaluated: actual.length,
    sourceGroups: new Set(actual.map((s) => s.sourceGroup)).size,
    micro: metrics(sums.tp, sums.fp, sums.fn),
    perClass,
    hostAssociation: {
      correct: hostCorrect,
      evaluated: hostEvaluated,
      accuracy: hostEvaluated ? hostCorrect / hostEvaluated : null,
    },
    ignoredPredictions: totalIgnored,
    samples: sampleReports,
  };
}

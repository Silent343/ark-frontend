import fs from "node:fs";
import path from "node:path";
import {
  blockProposals,
  entityBounds,
  intersects,
  classHint,
} from "./lib/corpus-audit.mjs";
const [flag, folder, outFlag, outputFolder] = process.argv.slice(2);
if (
  flag !== "--audit" ||
  !folder ||
  (outFlag && (outFlag !== "--out" || !outputFolder))
)
  throw new Error(
    "Usage: node scripts/prepare-cad-review-batch.mjs --audit .data/corpus/run",
  );
const root = path.resolve(folder),
  output = outputFolder ? path.resolve(outputFolder) : root,
  privateRoot = path.resolve(import.meta.dirname, "../.data");
if (
  !root.startsWith(privateRoot + path.sep) ||
  !output.startsWith(privateRoot + path.sep)
)
  throw new Error("Only private .data/ audit directories are accepted.");
const audit = JSON.parse(
  fs.readFileSync(path.join(root, "audit.json"), "utf8"),
);
const contextPath = path.join(root, "context.json");
const context = fs.existsSync(contextPath)
  ? JSON.parse(fs.readFileSync(contextPath, "utf8"))
  : null;
if (
  context &&
  (context.schemaVersion !== 1 ||
    typeof context.sourceGroup !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,99}$/.test(context.sourceGroup) ||
    context.buildingGroupConfirmedBy !== "user" ||
    context.permissions?.training !== "user-attested")
)
  throw new Error(
    "Corpus context must record an explicit user-attested group and training permission; it cannot certify independent review.",
  );
const targets = [
  {
    title: "Arquitectura · encuentro de muros",
    file: /PL_002/,
    classes: ["wall", "door", "window", "column"],
    seed: ["wall"],
    geometry: "polygon-or-polyline",
  },
  {
    title: "Equipamiento · mobiliario",
    file: /PL_004/,
    classes: ["chair", "table", "cabinet", "equipment"],
    seed: ["chair", "table"],
    geometry: "box",
  },
  {
    title: "Carpinterías · detalle de puertas",
    file: /PL_032/,
    classes: ["door", "wall"],
    seed: ["door"],
    geometry: "box",
  },
  {
    title: "Estructuras · columnas, vigas y cimentación",
    file: /^EST /,
    classes: ["column", "beam", "joist", "footing", "slab"],
    seed: ["column", "beam", "joist", "footing"],
    geometry: "polygon-or-polyline",
  },
  {
    title: "Sanitarias · red de agua",
    file: /IISS.*AGUA/i,
    classes: ["water", "valve", "sink", "toilet"],
    seed: ["water"],
    geometry: "polyline-network",
  },
  {
    title: "Sanitarias · red de desagüe",
    file: /IISS.*DESAGUES/i,
    classes: ["drain", "drain_fixture", "sink", "toilet"],
    seed: ["drain"],
    geometry: "polyline-network",
  },
  {
    title: "Sanitarias · detalles y símbolos",
    file: /IISS.*DETALLES/i,
    classes: ["sink", "toilet", "water", "drain", "valve"],
    seed: ["sink", "toilet", "water"],
    geometry: "box-and-polyline",
  },
];
const tasks = [],
  blocked = [];
for (const target of targets) {
  const result = audit.results.find((r) => target.file.test(r.file.name));
  if (
    !result ||
    result.status !== "audited" ||
    !result.afterEntities ||
    result.references.unresolved.length ||
    result.skipped.limit
  ) {
    blocked.push({
      title: target.title,
      reason: !result
        ? "source-not-selected"
        : (result.error ??
          (result.skipped?.limit
            ? "extraction-budget-reached"
            : !result.afterEntities
              ? "no-model-space-geometry"
              : "unresolved-external-reference")),
    });
    continue;
  }
  const vectors = JSON.parse(
    fs.readFileSync(
      path.join(root, `${result.file.hash}.vectors.json`),
      "utf8",
    ),
  );
  const visible = new Set(
    result.layers.filter((l) => l.visible).map((l) => l.name),
  );
  const sourceShapes = vectors.shapes.filter((e) => visible.has(e.layer));
  const proposals = blockProposals(sourceShapes);
  const seed = proposals.find((p) => target.seed.includes(p.class));
  const semanticPaths = sourceShapes
    .filter(
      (e) =>
        e.kind === "path" &&
        target.seed.includes(classHint(e.layer)) &&
        /red.*agua|red.*desague|iiss.*desague/i.test(e.layer),
    )
    .sort((a, b) => {
      const x = entityBounds(a),
        y = entityBounds(b);
      return (
        Math.max(x[2] - x[0], x[3] - x[1]) - Math.max(y[2] - y[0], y[3] - y[1])
      );
    });
  const networkSeed =
    target.geometry === "polyline-network"
      ? semanticPaths[Math.floor(semanticPaths.length * 0.75)]
      : undefined;
  const seedShape =
    networkSeed ??
    sourceShapes.find(
      (e) => e.kind !== "text" && target.seed.includes(classHint(e.layer)),
    );
  const b = networkSeed
    ? entityBounds(networkSeed)
    : (seed?.bbox ?? (seedShape ? entityBounds(seedShape) : vectors.bounds));
  const [x0, y0, x1, y1] = b,
    [gx0, gy0, gx1, gy1] = vectors.bounds;
  const globalSize = Math.max(gx1 - gx0, gy1 - gy0, 1);
  const nearbyExtents = sourceShapes
    .filter(
      (e) => e.kind === "path" && target.seed.includes(classHint(e.layer)),
    )
    .map((e) => {
      const b = entityBounds(e);
      return Math.max(b[2] - b[0], b[3] - b[1]);
    })
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const seedExtent = Math.max(x1 - x0, y1 - y0);
  const typical =
    nearbyExtents[Math.floor(nearbyExtents.length / 2)] ??
    (seedExtent || globalSize * 0.02);
  let size = Math.max(
    typical * 8,
    Math.min(globalSize * 0.35, Math.max(x1 - x0, y1 - y0) * 4),
    0.01,
  );
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  let crop = [cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2];
  let intersecting = sourceShapes.filter((e) =>
    intersects(entityBounds(e), crop),
  );
  while (intersecting.length > 6000 && size * 0.7 > seedExtent * 1.1) {
    size *= 0.7;
    crop = [cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2];
    intersecting = sourceShapes.filter((e) =>
      intersects(entityBounds(e), crop),
    );
  }
  // Not a training sample until the reviewer verifies crop/view, geometry, omissions and calibration.
  tasks.push({
    id: `${result.file.hash.slice(0, 16)}:${tasks.length + 1}`,
    title: target.title,
    sourceName: result.file.name,
    sourceHash: result.file.hash,
    dependencyHashes: result.references.loaded.map((r) => r.hash),
    sourceGroup: context?.sourceGroup ?? null,
    split: "unassigned",
    reviewed: false,
    reviewStatus: "pending-independent-review",
    annotator: "",
    reviewer: "",
    coordinateFrame: "cad-xy-y-up",
    units: result.header.units,
    viewType: "unconfirmed",
    cropConfirmed: false,
    crop,
    fullSourceBounds: vectors.bounds,
    recommendedGeometry: target.geometry,
    allowedClasses: target.classes,
    exhaustiveClasses: [],
    calibration: null,
    notes: "",
    annotations: [],
    proposals: proposals
      .filter(
        (p) => target.classes.includes(p.class) && intersects(p.bbox, crop),
      )
      .slice(0, 80),
    shapeCount: intersecting.length,
    previewTruncated: intersecting.length > 6000,
    shapes: intersecting.slice(0, 6000),
  });
}
const batch = {
  schemaVersion: "ark-review-draft-1",
  createdAt: new Date().toISOString(),
  annotationPolicy: "machine-proposals-are-not-ground-truth",
  rightsStatus: context
    ? "user-attested-training-permission"
    : audit.rightsStatus,
  ...(context ? { context } : {}),
  buildingGroupConfirmed: !!context,
  independentlyReviewed: false,
  trainingReady: false,
  blocked,
  tasks,
};
if (output !== root) fs.mkdirSync(output);
fs.writeFileSync(
  path.join(output, "review-batch.json"),
  JSON.stringify(batch, null, 2),
  { flag: "wx" },
);
const template = fs.readFileSync(
  path.join(import.meta.dirname, "templates/cad-review.html"),
  "utf8",
);
const script = fs.readFileSync(
  path.join(import.meta.dirname, "templates/cad-review.js"),
  "utf8",
);
const html = template
  .replace("/*REVIEW_SCRIPT*/", script)
  .replace(
    /\/\*BATCH_DATA\*\/\s*null/,
    JSON.stringify(batch).replace(/</g, "\\u003c"),
  );
fs.writeFileSync(path.join(output, "revision.html"), html, { flag: "wx" });
console.log(
  JSON.stringify({
    root,
    output,
    tasks: tasks.length,
    proposals: tasks.reduce((n, t) => n + t.proposals.length, 0),
    blocked,
    reviewed: false,
    trainingReady: false,
  }),
);

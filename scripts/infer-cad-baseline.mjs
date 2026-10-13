import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadDomain } from "./lib/domain-loader.mjs";

const args = process.argv.slice(2),
  options = {};
for (let i = 0; i < args.length; i += 2) {
  if (
    !["--source", "--meters-per-unit", "--sample-prefix", "--out"].includes(
      args[i],
    ) ||
    !args[i + 1]
  )
    throw new Error(
      "Usage: npm run infer:cad -- --source file.dwg --meters-per-unit 1 --sample-prefix building-a --out predictions.json",
    );
  options[args[i].slice(2)] = args[i + 1];
}
const units = Number(options["meters-per-unit"]),
  prefix = options["sample-prefix"];
if (
  !options.source ||
  !Number.isFinite(units) ||
  units <= 0 ||
  units > 1000 ||
  !prefix ||
  prefix.length > 100 ||
  !options.out
)
  throw new Error(
    "Source DWG, explicit metric unit, unique sample prefix and output are required.",
  );
if (path.extname(options.source).toLowerCase() !== ".dwg")
  throw new Error("This baseline runner accepts DWG sources.");
if (fs.statSync(options.source).size > 32 * 1024 * 1024)
  throw new Error("DWG exceeds 32 MB.");
const bytes = fs.readFileSync(options.source),
  sourceHash = createHash("sha256").update(bytes).digest("hex");
const acad = await import("../public/vendor/plan-tools/acad.bundle.js");
const doc = acad.DwgReader.readFromStream(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
);
const domain = "src/bounded-contexts/plan-digitization/domain/";
const { extractCadDrawing } = loadDomain(
  "src/bounded-contexts/plan-digitization/infrastructure/cad-plan-geometry",
);
const { createCadPlan } = loadDomain(domain + "cad-operations");
const { compileCadBlueprint } = loadDomain(domain + "cad-reconstruction");
const { modelDetectionExport } = loadDomain(domain + "detection-sample");
const source = extractCadDrawing(doc, acad);
if (source.skipped.ExternalReference)
  throw new Error(
    "Unresolved DWG external references. Resolve the selected package in the CAD editor before evaluation; an empty drawing is not a valid inference.",
  );
const start = performance.now();
// Units are applied BEFORE anonymous-layer inference and view detection.
const cad = createCadPlan(
  path.basename(options.source),
  source.shapes,
  source.layers,
  source.skipped,
  2.8,
  units,
);
const base = {
  projectId: prefix,
  width: 4000,
  height: 4000,
  scale: "",
  levels: [],
  walls: [],
  doors: [],
  windows: [],
  columns: [],
  rooms: [],
  materials: [],
  seismic: {
    defaultIntensity: 0,
    defaultDuration: 0,
    defaultDirection: "X",
    maxDisplacement: 0,
    maxDrift: 0,
  },
};
const plan = compileCadBlueprint(base, cad, 2.8),
  result = modelDetectionExport(plan);
result.detector.inputPolicy =
  "frozen-original-dwg; no workspace edits or correspondence overrides";
result.detector.configuration = {
  metersPerCadUnit: units,
  assumedStoreyHeightM: 2.8,
};
result.samples = result.samples.map((s) => ({ ...s, sourceHash }));
result.run = {
  sourceName: path.basename(options.source),
  sourceHash,
  semanticPipelineMs: Math.round(performance.now() - start),
};
fs.writeFileSync(options.out, JSON.stringify(result, null, 2) + "\n", {
  flag: "wx",
});
console.log(
  JSON.stringify({
    output: options.out,
    detector: result.detector,
    samples: result.samples.length,
    objects: result.samples.reduce((n, s) => n + s.objects.length, 0),
    sourceHash,
  }),
);

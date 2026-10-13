import fs from "node:fs";
import { evaluateDetections } from "./lib/detection-evaluation.mjs";
const args = process.argv.slice(2),
  options = {};
for (let i = 0; i < args.length; i += 2) {
  if (
    !["--truth", "--predictions", "--split", "--iou", "--out"].includes(
      args[i],
    ) ||
    !args[i + 1]
  )
    throw new Error(
      "Usage: npm run evaluate:detector -- --truth annotations.json --predictions predictions.json [--split test --iou 0.5 --out report.json]",
    );
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.truth || !options.predictions)
  throw new Error(
    "Both independent --truth and --predictions files are required. Detector output is not ground truth.",
  );
const read = (file) => {
  if (fs.statSync(file).size > 100_000_000)
    throw new Error("Input exceeds 100 MB.");
  return JSON.parse(fs.readFileSync(file, "utf8"));
};
const result = evaluateDetections(
  read(options.truth),
  read(options.predictions),
  { split: options.split ?? "test", iou: Number(options.iou ?? 0.5) },
);
const json = JSON.stringify(result, null, 2);
if (options.out) fs.writeFileSync(options.out, json + "\n", { flag: "wx" });
console.log(json);

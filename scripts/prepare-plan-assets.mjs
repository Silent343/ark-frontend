import { mkdir, readdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const destination = path.join(root, "public", "vendor", "plan-tools");
await mkdir(destination, { recursive: true });
const packageRoot = (name) =>
  path.dirname(require.resolve(`${name}/package.json`));
// Serve pinned workers, WASM and language weights from this application, not a third-party CDN.
await copyFile(
  path.join(packageRoot("pdfjs-dist"), "build/pdf.worker.min.mjs"),
  path.join(destination, "pdf.worker.min.mjs"),
);
await copyFile(
  path.join(packageRoot("tesseract.js"), "dist/worker.min.js"),
  path.join(destination, "worker.min.js"),
);
const core = packageRoot("tesseract.js-core");
for (const name of await readdir(core)) {
  if (/^tesseract-core.*\.(js|wasm)$/.test(name))
    await copyFile(path.join(core, name), path.join(destination, name));
}
for (const language of ["eng", "spa", "por"]) {
  await copyFile(
    path.join(
      packageRoot(`@tesseract.js-data/${language}`),
      `4.0.0_best_int/${language}.traineddata.gz`,
    ),
    path.join(destination, `${language}.traineddata.gz`),
  );
}
console.log("Prepared local PDF/OCR assets.");

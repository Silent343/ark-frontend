import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const cache = new Map(),
  root = path.resolve(import.meta.dirname, "../..");
/** Execute the same pure TypeScript domain modules used by the app, without React or WebGL. */
export function loadDomain(name) {
  const file = path.resolve(root, name.endsWith(".ts") ? name : name + ".ts");
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} };
  cache.set(file, loaded);
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, {
    filename: file,
  })(
    (id) => loadDomain(path.resolve(path.dirname(file), id)),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

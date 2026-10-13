import assert from "node:assert/strict";
import { loadDomain } from "./lib/domain-loader.mjs";
const { cadReferenceName, resolveCadExternalReferences } = loadDomain(
  "src/bounded-contexts/plan-digitization/infrastructure/cad-external-references",
);
const collection = (items) => ({
  get count() {
    return items.length;
  },
  add: (e) => items.push(e),
  [Symbol.iterator]: () => items[Symbol.iterator](),
});
const block = (reference) => ({
  blockEntity: { xRefPath: reference },
  entities: collection([]),
});
const source = { clone: () => ({ id: "cloned" }) };
const child = {
  blockRecords: [],
  modelSpace: { entities: collection([source]) },
  header: { modelSpaceInsertionBase: { x: 3, y: 4, z: 0 } },
};
const ref = block("..\\BASE.dwg"),
  doc = { blockRecords: [ref] };
assert.equal(cadReferenceName("C:\\x\\BASE.dwg"), "base.dwg");
assert.deepEqual(
  resolveCadExternalReferences(doc, () => undefined),
  ["base.dwg"],
);
assert.equal(
  ref.entities.count,
  0,
  "missing references must not be filled with invented geometry",
);
assert.deepEqual(
  resolveCadExternalReferences(doc, (n) =>
    n === "base.dwg" ? child : undefined,
  ),
  [],
);
assert.equal(ref.entities.count, 1);
assert.equal(ref.blockEntity.basePoint, child.header.modelSpaceInsertionBase);
assert.deepEqual(
  resolveCadExternalReferences(doc, () => {
    throw new Error("already resolved");
  }),
  [],
);
const cycle = {
  blockRecords: [block("self.dwg")],
  modelSpace: { entities: collection([]) },
};
assert(
  resolveCadExternalReferences(cycle, () => cycle)[0].includes("circular"),
);
console.log(
  "CAD references: explicit selection, missing reference, clone/base-point, idempotence and cycles passed.",
);

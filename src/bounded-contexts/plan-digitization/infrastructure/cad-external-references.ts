import type { CadDocument, BlockRecord, Entity } from "@node-projects/acad-ts";

export const cadReferenceName = (name: string) =>
  name.replace(/\\/g, "/").split("/").at(-1)!.normalize("NFC").toLowerCase();

/** Resolve only explicit external block references from selected files. Never fetch paths embedded in a DWG. */
export function resolveCadExternalReferences(
  document: CadDocument,
  resolve: (name: string) => CadDocument | undefined,
) {
  const missing = new Set<string>(),
    visiting = new Set<CadDocument>();
  function visit(doc: CadDocument, depth: number) {
    if (depth > 8) {
      missing.add("Límite de referencias anidadas (8)");
      return;
    }
    if (visiting.has(doc)) return;
    visiting.add(doc);
    for (const block of doc.blockRecords ?? []) {
      const reference = block.blockEntity?.xRefPath;
      if (!reference || block.entities.count > 0) continue;
      const name = cadReferenceName(reference);
      if (!/\.(dwg|dxf)$/i.test(name)) continue;
      const external = resolve(name);
      if (!external || !external.modelSpace) {
        missing.add(name);
        continue;
      }
      if (visiting.has(external)) {
        missing.add(`${name} (referencia circular)`);
        continue;
      }
      visit(external, depth + 1);
      if (missing.size) continue;
      // The Insert's own affine transform remains authoritative for insertion, rotation and scale.
      for (const entity of external.modelSpace.entities)
        block.entities.add(entity.clone() as Entity);
      const base = external.header?.modelSpaceInsertionBase;
      if (base) block.blockEntity.basePoint = base;
    }
    visiting.delete(doc);
  }
  visit(document, 0);
  return [...missing];
}

export function missingCadReferences(document: CadDocument): string[] {
  return [...(document.blockRecords ?? [])]
    .filter(
      (b: BlockRecord) => b.blockEntity?.xRefPath && b.entities.count === 0,
    )
    .map((b) => cadReferenceName(b.blockEntity.xRefPath!));
}

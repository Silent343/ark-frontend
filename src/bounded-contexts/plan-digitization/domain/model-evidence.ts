import type { Blueprint } from "./entities/blueprint";

/** Source references are data, not claims of recognition accuracy or verified BIM. */
export function validModelEvidence(plan: Blueprint): boolean {
  if (
    plan.intent !== undefined &&
    !["visualization", "coordination", "bim-preparation"].includes(plan.intent)
  )
    return false;
  if (
    plan.levels.some(
      (l) =>
        l.heightSource !== undefined &&
        !["manual", "levels", "assumed"].includes(l.heightSource),
    )
  )
    return false;
  for (const region of plan.cad?.regions ?? []) {
    if (
      region.elevationSource !== undefined &&
      !["annotation", "manual"].includes(region.elevationSource)
    )
      return false;
    if (
      region.wallHeight !== undefined &&
      (!Number.isFinite(region.wallHeight) ||
        region.wallHeight <= 0 ||
        region.wallHeight > 100)
    )
      return false;
    if (
      region.alignment !== undefined &&
      (!region.alignment ||
        ![region.alignment.x, region.alignment.y].every(
          (v) => Number.isFinite(v) && Math.abs(v) <= 100000,
        ))
    )
      return false;
  }
  if (plan.elementEvidence === undefined) return true;
  if (
    !plan.cad ||
    !plan.elementEvidence ||
    typeof plan.elementEvidence !== "object" ||
    Array.isArray(plan.elementEvidence) ||
    Object.keys(plan.elementEvidence).length > 80000
  )
    return false;
  const elements = new Set(
    [
      plan.walls,
      plan.doors,
      plan.windows,
      plan.columns,
      plan.stairs ?? [],
      plan.slabs ?? [],
      plan.roofs ?? [],
      plan.fixtures ?? [],
    ]
      .flat()
      .map((e) => e.id),
  );
  const sources = new Set(plan.cad.entities.map((e) => e.id));
  const regions = new Set(plan.cad.regions.map((r) => r.id));
  const properties = new Set([
    "height",
    "thickness",
    "material",
    "sillHeight",
    "type",
    "elevation",
    "slope",
    "rise",
  ]);
  return Object.entries(plan.elementEvidence).every(
    ([id, e]) =>
      elements.has(id) &&
      e &&
      typeof e === "object" &&
      !Array.isArray(e) &&
      e.sourceName === plan.cad!.sourceName &&
      regions.has(e.regionId) &&
      [
        "paired-faces",
        "cad-symbol",
        "closed-contour",
        "treads",
        "cad-text",
      ].includes(e.method) &&
      Array.isArray(e.sourceIds) &&
      e.sourceIds.length <= 500 &&
      e.sourceIds.every((id) => sources.has(id)) &&
      Array.isArray(e.assumed) &&
      e.assumed.length <= properties.size &&
      e.assumed.every((p) => properties.has(p)),
  );
}

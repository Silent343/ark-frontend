import type { Blueprint } from "../entities/blueprint";
import type { CanonicalFloorPlanGraph } from "./types";

export type PreparationState =
  | "UNINITIALIZED"
  | "AWAITING_UNITS"
  | "AWAITING_FLOOR_SELECTION"
  | "READY_TO_RECONSTRUCT"
  | "RECONSTRUCTING"
  | "RECONSTRUCTED"
  | "NEEDS_REVIEW"
  | "FAILED";
export interface PreparationReport {
  state: PreparationState;
  unitsConfirmed: boolean;
  selectedFloors: number;
  geometryCount: number;
  classified: number;
  eligible: number;
  coverage: number | null;
  unresolvedIds: string[];
  skippedEntities: number;
  blockers: Array<{ message: string; elementIds: string[] }>;
}

/** Deterministic preparation state, derived from the current revision rather than stale UI flags. */
export function preparationReport(
  plan: Blueprint,
  graph?: CanonicalFloorPlanGraph,
  operation: "idle" | "running" | "failed" = "idle",
): PreparationReport {
  const geometryCount =
    plan.walls.length +
    plan.columns.length +
    (plan.slabs?.length ?? 0) +
    (plan.roofs?.length ?? 0) +
    (plan.stairs?.length ?? 0) +
    (plan.fixtures?.length ?? 0);
  const cad = plan.cad;
  const selected =
    cad?.regions.filter(
      (r) => r.enabled && (!r.viewType || r.viewType === "plan"),
    ) ?? [];
  const unitsConfirmed = cad ? cad.unitConfirmed : !!plan.calibration;
  const roles = new Map(cad?.layers.map((l) => [l.name, l.role]));
  const eligible =
    cad?.entities.filter((e) => {
      if (e.kind === "text" || e.group?.includes("dimension")) return false;
      if (!selected.length) return false;
      return selected.some((r) => {
        if (e.kind === "circle")
          return (
            e.x >= r.minX && e.x <= r.maxX && e.y >= r.minY && e.y <= r.maxY
          );
        for (let i = 0; i < e.points.length; i += 2)
          if (
            e.points[i] >= r.minX &&
            e.points[i] <= r.maxX &&
            e.points[i + 1] >= r.minY &&
            e.points[i + 1] <= r.maxY
          )
            return true;
        return false;
      });
    }) ?? [];
  const unresolvedIds = eligible
    .filter(
      (e) => (e.role ?? roles.get(e.layer) ?? "reference") === "reference",
    )
    .map((e) => e.id);
  const selectedFloors = cad
    ? selected.length
    : plan.sheets?.filter((s) => !s.viewType || s.viewType === "plan").length ||
      (geometryCount ? plan.levels.length : 0);
  const classified = eligible.length - unresolvedIds.length;
  const blockers = graph?.issues.filter((i) => i.severity === "blocking") ?? [];
  let state: PreparationState;
  if (!cad && !plan.sourceImage && !plan.sheets?.length && !geometryCount)
    state = "UNINITIALIZED";
  else if (!unitsConfirmed) state = "AWAITING_UNITS";
  else if (!selectedFloors) state = "AWAITING_FLOOR_SELECTION";
  else if (operation === "failed") state = "FAILED";
  else if (operation === "running") state = "RECONSTRUCTING";
  else if (blockers.length || !geometryCount) state = "NEEDS_REVIEW";
  else if (graph) state = "RECONSTRUCTED";
  else state = "READY_TO_RECONSTRUCT";
  return {
    state,
    unitsConfirmed,
    selectedFloors,
    geometryCount,
    classified,
    eligible: eligible.length,
    coverage: eligible.length ? classified / eligible.length : null,
    unresolvedIds,
    blockers,
    skippedEntities: Object.values(cad?.skipped ?? {}).reduce(
      (sum, n) => sum + n,
      0,
    ),
  };
}

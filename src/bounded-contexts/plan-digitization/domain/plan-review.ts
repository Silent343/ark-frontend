import type { Blueprint, PlanReview } from "./entities/blueprint";
import { synchronizePlanAreas } from "./plan-calibration";
import { sourceSheetForElement } from "./plan-provenance";

export function planElements(plan: Blueprint) {
  return [
    ...plan.walls,
    ...plan.rooms,
    ...plan.doors,
    ...plan.windows,
    ...plan.columns,
    ...(plan.stairs ?? []),
    ...(plan.roofs ?? []),
    ...(plan.services ?? []),
  ];
}

/** A sheet is reviewed only when its linked geometry was individually accepted. */
export function sheetReviewProgress(plan: Blueprint, sheetId: string) {
  const linked = planElements(plan).filter((element) =>
    sourceSheetForElement(plan, element)?.id === sheetId);
  const accepted = new Set(plan.review?.reviewedIds ?? []);
  return {
    total: linked.length,
    reviewed: linked.filter((element) => accepted.has(element.id)).length,
    pending: linked.filter((element) => !accepted.has(element.id)),
  };
}

/** A new source updates OCR evidence without erasing decisions on unchanged geometry. */
export function mergeImportedReview(previous: Blueprint, next: Blueprint, evidence: PlanReview, replacedSheetId?: string): Blueprint {
  const existingIds = new Set(planElements(next).map((element) => element.id));
  const replacedIds = new Set(replacedSheetId
    ? planElements(previous).filter((element) => sourceSheetForElement(previous, element)?.id === replacedSheetId).map((element) => element.id)
    : []);
  return {
    ...next,
    review: {
      ...evidence,
      reviewedIds: (previous.review?.reviewedIds ?? []).filter((id) => existingIds.has(id) && !replacedIds.has(id)),
      status: "draft",
    },
  };
}

/** Editing accepted geometry invalidates only the affected evidence; undo can restore it. */
export function reconcilePlanReview(
  previous: Blueprint,
  candidate: Blueprint,
): Blueprint {
  const next = synchronizePlanAreas(candidate);
  if (!next.review) return next;
  const before = new Map(
    planElements(previous).map((element) => [
      element.id,
      JSON.stringify(element),
    ]),
  );
  const changedScale =
    JSON.stringify(previous.calibration) !== JSON.stringify(next.calibration);
  // Adding a floor does not change evidence already accepted on existing levels.
  const changedLevels = previous.levels.some((level) =>
    !next.levels.some((candidate) =>
      candidate.id === level.id && candidate.elevation === level.elevation));
  const current = planElements(next);
  const reviewedIds = next.review.reviewedIds.filter(
    (id) =>
      !changedScale && !changedLevels &&
      current.some(
        (element) =>
          element.id === id && before.get(id) === JSON.stringify(element),
      ),
  );
  return {
    ...next,
    review: {
      ...next.review,
      reviewedIds,
      status:
        current.length > 0 &&
        reviewedIds.length === current.length &&
        !!next.calibration &&
        !planTopologyIssues(next).length
          ? "reviewed"
          : "draft",
    },
  };
}

/** Geometric checks are independent of any recognition model and run after human corrections. */
export function planTopologyIssues(plan: Blueprint): string[] {
  const issues: string[] = [];
  const firstLevel = plan.levels.find((level) => level.elevation === 0)?.id ?? plan.levels[0]?.id;
  for (const collection of [plan.rooms, plan.roofs ?? [], plan.services ?? []]) {
    for (const item of collection) {
      if (item.x < 0 || item.y < 0 || item.x > plan.width || item.y > plan.height)
        issues.push(`${item.id}: outside-sheet`);
    }
  }
  for (const roof of plan.roofs ?? []) {
    if (roof.x + roof.width > plan.width + 0.5 || roof.y + roof.depth > plan.height + 0.5)
      issues.push(`${roof.id}: outside-sheet`);
  }
  for (const room of plan.rooms) {
    if (room.x + room.width > plan.width + 0.5 || room.y + room.height > plan.height + 0.5)
      issues.push(`${room.id}: outside-sheet`);
  }
  for (const sheet of plan.sheets ?? []) {
    if (sheet.x < 0 || sheet.y < 0 || sheet.x + sheet.width > plan.width + 0.5 ||
      sheet.y + sheet.height > plan.height + 0.5)
      issues.push(`${sheet.id}: outside-sheet`);
  }
  for (const wall of plan.walls) {
    if ([...wall.start, ...wall.end].some((value, index) =>
      value < 0 || value > (index % 2 === 0 ? plan.width : plan.height)))
      issues.push(`${wall.id}: outside-sheet`);
    const dx = wall.end[0] - wall.start[0],
      dy = wall.end[1] - wall.start[1],
      length = Math.hypot(dx, dy);
    if (length < 1) {
      issues.push(`${wall.id}: zero-length`);
      continue;
    }
    let cursor = -Infinity;
    const openings = [...plan.doors, ...plan.windows]
      .filter((item) => item.wallId === wall.id && (item.levelId ?? firstLevel) === (wall.levelId ?? firstLevel))
      .map((item) => {
        const distance =
          ((item.x - wall.start[0]) * dx + (item.y - wall.start[1]) * dy) /
          length;
        const lateral =
          Math.abs(
            (item.x - wall.start[0]) * dy - (item.y - wall.start[1]) * dx,
          ) / length;
        return {
          item,
          start: distance - item.width / 2,
          end: distance + item.width / 2,
          lateral,
        };
      })
      .sort((a, b) => a.start - b.start);
    for (const opening of openings) {
      if (
        opening.start < -0.5 ||
        opening.end > length + 0.5 ||
        opening.lateral > Math.max(2, wall.thickness / 2)
      )
        issues.push(`${opening.item.id}: outside-wall`);
      if (opening.start < cursor - 0.5)
        issues.push(`${opening.item.id}: overlapping-opening`);
      cursor = Math.max(cursor, opening.end);
    }
  }
  return issues;
}

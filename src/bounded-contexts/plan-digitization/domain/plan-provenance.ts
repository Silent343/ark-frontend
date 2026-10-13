import type { Blueprint, PlanSheet } from "./entities/blueprint";

interface SourcedGeometry {
  id: string;
  levelId?: string;
  sheetId?: string;
}

/** Explicit references win; the ID convention exists only to read older imported plans. */
export function sourceSheetForElement(
  plan: Blueprint,
  element: SourcedGeometry,
): PlanSheet | undefined {
  const sheets = plan.sheets ?? [];
  const ground =
    plan.levels.find((level) => level.elevation === 0)?.id ??
    plan.levels[0]?.id;
  const levelId = element.levelId ?? ground;
  if (element.sheetId)
    return sheets.find(
      (sheet) => sheet.id === element.sheetId && sheet.levelId === levelId,
    );
  const legacy = /^(?:wall|room|service)-([0-9a-f]{8})-\d+$/.exec(element.id);
  if (!legacy) return undefined;
  // Never guess when a truncated legacy prefix is ambiguous.
  const matches = sheets.filter(
    (sheet) => sheet.levelId === levelId && sheet.id.startsWith(legacy[1]),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** Hydrate old imports in memory; a normal subsequent save persists their explicit links. */
export function hydrateLegacySheetProvenance(plan: Blueprint): Blueprint {
  if (!plan.sheets?.length) return plan;
  const attach = <T extends SourcedGeometry>(items: T[]): T[] =>
    items.map((item) => {
      if (item.sheetId) return item;
      const sheet = sourceSheetForElement(plan, item);
      return sheet ? { ...item, sheetId: sheet.id } : item;
    });
  return {
    ...plan,
    walls: attach(plan.walls),
    rooms: attach(plan.rooms),
    services: plan.services && attach(plan.services),
  };
}

/** Reimport removes only geometry sourced from the chosen page and dependent openings. */
export function withoutSheetGeometry(
  plan: Blueprint,
  sheetId: string,
): Blueprint {
  const belongs = (element: SourcedGeometry) =>
    sourceSheetForElement(plan, element)?.id === sheetId;
  const removedWalls = new Set(
    plan.walls.filter(belongs).map((wall) => wall.id),
  );
  const removedServices = new Set(
    (plan.services ?? []).filter(belongs).map((service) => service.id),
  );
  return {
    ...plan,
    walls: plan.walls.filter((wall) => !belongs(wall)),
    rooms: plan.rooms.filter((room) => !belongs(room)),
    slabs: plan.slabs?.filter((slab) => !belongs(slab)),
    doors: plan.doors.filter(
      (door) => !belongs(door) && !removedWalls.has(door.wallId),
    ),
    windows: plan.windows.filter(
      (window) => !belongs(window) && !removedWalls.has(window.wallId),
    ),
    columns: plan.columns.filter((column) => !belongs(column)),
    stairs: plan.stairs?.filter((stair) => !belongs(stair)),
    roofs: plan.roofs?.filter((roof) => !belongs(roof)),
    services: plan.services?.filter((service) => !belongs(service)),
    routes: plan.routes?.filter(
      (route) =>
        !belongs(route) &&
        !removedServices.has(route.fromId) &&
        !removedServices.has(route.toId),
    ),
  };
}

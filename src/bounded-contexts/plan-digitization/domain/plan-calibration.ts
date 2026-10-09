import type { Blueprint } from "./entities/blueprint";

export type PlanPoint = [number, number];

/** Screen coordinates are not metres. Legacy plans retain their original conversion. */
export function metersPerUnit(blueprint: Blueprint): number {
  return blueprint.calibration?.metersPerUnit ?? 1 / 86;
}

export function calibratePlan(
  blueprint: Blueprint,
  points: [PlanPoint, PlanPoint],
  distanceM: number,
): Blueprint {
  if (
    points.some(
      ([x, y]) =>
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        y < 0 ||
        x > blueprint.width ||
        y > blueprint.height,
    )
  )
    throw new Error("Reference points must lie inside the plan image.");
  const pixels = Math.hypot(
    points[1][0] - points[0][0],
    points[1][1] - points[0][1],
  );
  if (
    !Number.isFinite(distanceM) ||
    distanceM <= 0 ||
    distanceM > 1000 ||
    pixels < 10
  )
    throw new Error(
      "Mark two points at least 10 px apart and a distance between 0 and 1000 m.",
    );
  const ratio = distanceM / pixels;
  return synchronizePlanAreas({
    ...blueprint,
    scale: `${(100 * ratio).toFixed(3)} m / 100 px`,
    calibration: {
      metersPerUnit: ratio,
      referencePoints: points,
      referenceDistanceM: distanceM,
    },
  });
}

/** Quantities follow calibrated dimensions after every edit. */
export function synchronizePlanAreas(blueprint: Blueprint): Blueprint {
  if (!blueprint.calibration) return blueprint;
  const ratio = metersPerUnit(blueprint);
  return {
    ...blueprint,
    rooms: blueprint.rooms.map((room) => ({
      ...room,
      area: Number((room.width * room.height * ratio ** 2).toFixed(2)),
    })),
  };
}

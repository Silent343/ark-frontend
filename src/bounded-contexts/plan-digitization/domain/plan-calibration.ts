import type { Blueprint } from "./entities/blueprint";
import { signedArea } from "./cad-topology";

export type PlanPoint = [number, number];

/** Original image coordinates, not coordinates rescaled into a project sheet. */
export interface SourceCalibration {
  sourceSize: { width: number; height: number };
  referencePoints: [PlanPoint, PlanPoint];
  referenceDistanceM: number;
}

export function validSourceCalibration(value: unknown, ratio?: number): value is SourceCalibration {
  if (!value || typeof value !== 'object') return false;
  const c = value as SourceCalibration, size = c.sourceSize, points = c.referencePoints;
  return !!size && [size.width,size.height].every(n=>Number.isInteger(n)&&n>0&&n<=6000) &&
    Array.isArray(points)&&points.length===2&&points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=0&&p[1]>=0&&p[0]<=size.width&&p[1]<=size.height)&&
    Number.isFinite(c.referenceDistanceM)&&c.referenceDistanceM>0&&c.referenceDistanceM<=1000&&Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1])>=10&&
    (ratio===undefined||(Number.isFinite(ratio)&&ratio>0&&Math.abs(c.referenceDistanceM/Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1])-ratio)<=Math.max(1e-10,ratio*1e-8)));
}

/** A thumbnail or different source must never silently reuse an unrelated anchor. */
export function restoreSourceCalibration(value: unknown, size: {width:number;height:number}): SourceCalibration | undefined {
  return validSourceCalibration(value)&&value.sourceSize.width===size.width&&value.sourceSize.height===size.height?value:undefined;
}

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
      area: Number(((room.polygon
        ? Math.max(0, Math.abs(signedArea(room.polygon)) - (room.holes ?? []).reduce((sum,h)=>sum+Math.abs(signedArea(h)),0))
        : room.width * room.height) * ratio ** 2).toFixed(2)),
    })),
  };
}

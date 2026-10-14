import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import {
  familyForFixture,
  validFamilyAssignment,
  type FixtureFamilyAssignments,
} from "../../plan-digitization/domain/fixture-families";

export type FixtureShape = "box" | "cylinder" | "sphere" | "ring" | "basin";
export type FixtureFinish =
  "wood" | "fabric" | "metal" | "ceramic" | "green" | "dark" | "glass";
export type FixturePart = {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotation: number;
  tint: string;
};
export interface FixtureBatch {
  shape: FixtureShape;
  finish: FixtureFinish;
  parts: FixturePart[];
}
const colors: Record<FixtureFinish, string> = {
  wood: "#ab8c67",
  fabric: "#71878a",
  metal: "#72797d",
  ceramic: "#efeee8",
  green: "#678060",
  dark: "#303639",
  glass: "#819ea6",
};

/** Procedural assemblies in source dimensions; fixed primitive/material batches share GPU resources. */
export function buildFixtureParts(
  fixtures: NonNullable<Blueprint["fixtures"]>,
  centerX: number,
  centerY: number,
  scale: number,
  assignments: FixtureFamilyAssignments = {},
  detail: "low" | "standard" = "standard",
): FixtureBatch[] {
  if (![centerX, centerY, scale].every(Number.isFinite) || scale <= 0)
    return [];
  const batches = new Map<string, FixtureBatch>();
  for (const item of fixtures) {
    if (
      ![
        item.x,
        item.y,
        item.width,
        item.depth,
        item.height,
        item.rotation ?? 0,
      ].every(Number.isFinite) ||
      Math.min(item.width, item.depth, item.height) <= 0
    )
      continue;
    const w = item.width / scale,
      d = item.depth / scale,
      h = item.height;
    const family = familyForFixture(item, assignments);
    const candidate = assignments[item.id];
    const selection =
      validFamilyAssignment(candidate) && candidate.familyId === family?.id
        ? candidate
        : undefined;
    const rotation = (-(item.rotation ?? 0) * Math.PI) / 180;
    // All local coordinates are fractions of the original footprint and source height.
    const add = (
      finish: FixtureFinish,
      shape: FixtureShape,
      x: number,
      y: number,
      z: number,
      width: number,
      height: number,
      depth: number,
    ) => {
      const key = `${finish}:${shape}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = { finish, shape, parts: [] };
        batches.set(key, batch);
      }
      const tint =
        !["green", "dark"].includes(finish) && selection?.finish !== "natural"
          ? selection?.finish === "dark"
            ? "#394449"
            : selection?.finish === "light"
              ? "#ddd7cb"
              : colors[finish]
          : colors[finish];
      batch.parts.push({
        id: item.id,
        x:
          (item.x - centerX) / scale +
          Math.cos(rotation) * x * w +
          Math.sin(rotation) * z * d,
        y: y * h + (selection?.elevationM ?? 0),
        z:
          (item.y - centerY) / scale -
          Math.sin(rotation) * x * w +
          Math.cos(rotation) * z * d,
        width: width * w,
        height: height * h,
        depth: depth * d,
        rotation,
        tint,
      });
    };
    const box = (
      f: FixtureFinish,
      x: number,
      y: number,
      z: number,
      bw: number,
      bh: number,
      bd: number,
    ) => add(f, "box", x, y, z, bw, bh, bd);
    const legs = (height: number, finish: FixtureFinish = "metal") => {
      for (const x of [-0.37, 0.37])
        for (const z of [-0.34, 0.34])
          add(finish, "cylinder", x, height / 2, z, 0.055, height, 0.055);
    };
    if (detail === "low") {
      if (item.kind === "chair") {
        box("fabric", 0, 0.5, 0, 0.92, 0.12, 0.88);
        box("fabric", 0, 0.79, 0.4, 0.92, 0.42, 0.12);
        box("metal", 0, 0.24, 0, 0.45, 0.48, 0.55);
      } else {
        box(
          item.kind === "sink" ||
            item.kind === "toilet" ||
            item.kind === "bathtub"
            ? "ceramic"
            : item.kind === "sofa" || item.kind === "bed"
              ? "fabric"
              : "wood",
          0,
          0.5,
          0,
          1,
          1,
          1,
        );
      }
      continue;
    }
    switch (family?.id) {
      case "chair-office":
        add("dark", "cylinder", 0, 0.075, 0, 0.8, 0.05, 0.8);
        add("metal", "cylinder", 0, 0.27, 0, 0.08, 0.38, 0.08);
        box("fabric", 0, 0.5, 0, 0.86, 0.13, 0.75);
        box("fabric", 0, 0.8, 0.36, 0.78, 0.4, 0.12);
        for (const x of [-0.45, 0.45]) {
          box("dark", x, 0.64, 0, 0.08, 0.06, 0.62);
          box("metal", x, 0.55, 0.15, 0.04, 0.18, 0.04);
        }
        break;
      case "chair-auditorium":
        box("fabric", 0, 0.51, -0.03, 0.8, 0.14, 0.78);
        box("fabric", 0, 0.77, 0.37, 0.84, 0.46, 0.14);
        for (const x of [-0.45, 0.45]) {
          box("wood", x, 0.63, -0.03, 0.1, 0.07, 0.85);
          box("metal", x, 0.31, 0.03, 0.07, 0.62, 0.11);
          box("metal", x, 0.035, 0, 0.1, 0.07, 0.55);
        }
        break;
      case "chair-standard":
        box("fabric", 0, 0.5, -0.03, 0.95, 0.1, 0.86);
        box("fabric", 0, 0.8, 0.4, 0.92, 0.4, 0.1);
        legs(0.45);
        break;
      case "table-round":
        add("wood", "cylinder", 0, 0.95, 0, 1, 0.1, 1);
        add("metal", "cylinder", 0, 0.46, 0, 0.1, 0.88, 0.1);
        add("metal", "cylinder", 0, 0.035, 0, 0.6, 0.07, 0.6);
        break;
      case "table-rectangular":
        box("wood", 0, 0.95, 0, 1, 0.1, 1);
        legs(0.9);
        break;
      case "sofa-two":
      case "sofa-three": {
        box("dark", 0, 0.11, 0, 0.86, 0.12, 0.84);
        box("fabric", 0, 0.32, 0, 0.94, 0.3, 0.94);
        box("fabric", 0, 0.78, 0.4, 0.96, 0.44, 0.2);
        for (const x of [-0.46, 0.46])
          box("fabric", x, 0.56, 0, 0.08, 0.44, 0.94);
        const count = family.id === "sofa-three" ? 3 : 2;
        for (let i = 0; i < count; i++) {
          const x = -0.4 + (0.8 * (i + 0.5)) / count;
          box("fabric", x, 0.52, -0.06, 0.78 / count, 0.13, 0.74);
          box("fabric", x, 0.78, 0.27, 0.78 / count, 0.35, 0.12);
        }
        break;
      }
      case "bed-single":
      case "bed-double": {
        box("wood", 0, 0.23, 0, 1, 0.3, 0.96);
        box("fabric", 0, 0.49, -0.02, 0.94, 0.22, 0.92);
        box("wood", 0, 0.64, 0.46, 1, 0.72, 0.08);
        box("fabric", 0, 0.62, -0.18, 0.95, 0.04, 0.6);
        const count = family.id === "bed-double" ? 2 : 1;
        for (let i = 0; i < count; i++)
          box(
            "ceramic",
            -0.4 + (0.8 * (i + 0.5)) / count,
            0.66,
            0.26,
            0.7 / count,
            0.1,
            0.2,
          );
        break;
      }
      case "toilet-floor":
      case "toilet-wall": {
        const wall = family.id === "toilet-wall";
        if (!wall) add("ceramic", "sphere", 0, 0.23, -0.1, 0.6, 0.46, 0.6);
        add("ceramic", "basin", 0, wall ? 0.54 : 0.49, -0.12, 0.9, 0.4, 0.74);
        add("ceramic", "ring", 0, wall ? 0.76 : 0.71, -0.1, 0.94, 0.045, 0.78);
        box(
          "ceramic",
          0,
          wall ? 0.7 : 0.76,
          0.38,
          0.8,
          wall ? 0.24 : 0.48,
          0.24,
        );
        box("metal", 0, wall ? 0.83 : 0.97, 0.38, 0.18, 0.03, 0.12);
        break;
      }
      case "sink-vanity":
      case "sink-pedestal":
      case "sink-wall": {
        if (family.id === "sink-vanity") {
          box("wood", 0, 0.36, 0, 0.94, 0.68, 0.92);
          for (const x of [-0.24, 0.24]) {
            box("wood", x, 0.38, -0.45, 0.46, 0.62, 0.025);
            box("metal", x, 0.58, -0.48, 0.13, 0.025, 0.02);
          }
        } else if (family.id === "sink-pedestal")
          add("ceramic", "cylinder", 0, 0.37, 0.12, 0.26, 0.74, 0.3);
        add("ceramic", "basin", 0, 0.79, 0, 1, 0.22, 1);
        add("metal", "cylinder", 0, 0.91, 0.35, 0.045, 0.18, 0.045);
        box("metal", 0, 0.98, 0.24, 0.045, 0.04, 0.25);
        break;
      }
      case "cabinet-base":
      case "cabinet-tall": {
        box("dark", 0, 0.055, 0, 0.9, 0.11, 0.9);
        box("wood", 0, 0.52, 0, 1, 0.9, 0.96);
        box("ceramic", 0, 0.985, 0, 1, 0.03, 1);
        for (const x of [-0.25, 0.25]) {
          box("wood", x, 0.54, -0.46, 0.48, 0.85, 0.02);
          box("metal", x - 0.1, 0.6, -0.485, 0.025, 0.15, 0.02);
        }
        break;
      }
      case "bench-timber":
        for (let i = 0; i < 4; i++)
          box("wood", 0, 0.95, -0.375 + i * 0.25, 1, 0.1, 0.22);
        for (const x of [-0.35, 0.35]) box("metal", x, 0.45, 0, 0.08, 0.9, 0.8);
        break;
      case "bathtub-inset":
      case "bathtub-free":
        if (family.id === "bathtub-inset") {
          for (const x of [-0.46, 0.46])
            box("ceramic", x, 0.45, 0, 0.08, 0.9, 1);
          for (const z of [-0.46, 0.46])
            box("ceramic", 0, 0.45, z, 0.84, 0.9, 0.08);
        }
        add("ceramic", "basin", 0, 0.49, 0, 0.96, 0.94, 0.96);
        add("ceramic", "ring", 0, 0.98, 0, 1, 0.04, 1);
        break;
      case "fireplace-built-in":
        for (const x of [-0.41, 0.41]) box("ceramic", x, 0.5, 0, 0.18, 1, 1);
        box("ceramic", 0, 0.9, 0, 1, 0.2, 1);
        box("dark", 0, 0.41, 0.4, 0.65, 0.62, 0.06);
        box("ceramic", 0, 0.06, 0, 1, 0.12, 1);
        break;
      case "chimney-masonry":
        for (const x of [-0.44, 0.44]) box("ceramic", x, 0.5, 0, 0.12, 1, 1);
        for (const z of [-0.44, 0.44]) box("ceramic", 0, 0.5, z, 0.76, 1, 0.12);
        break;
      case "plant-potted":
        add("wood", "cylinder", 0, 0.17, 0, 0.4, 0.34, 0.4);
        add("green", "sphere", 0, 0.64, 0, 1, 0.72, 1);
        break;
      case "vehicle-compact":
        box("metal", 0, 0.4, 0, 0.92, 0.4, 1);
        box("glass", 0, 0.75, 0.03, 0.8, 0.3, 0.5);
        for (const x of [-0.44, 0.44])
          for (const z of [-0.31, 0.31])
            add("dark", "sphere", x, 0.22, z, 0.12, 0.3, 0.14);
        break;
      default:
        box("metal", 0, 0.5, 0, 1, 1, 1);
    }
  }
  return [...batches.values()];
}

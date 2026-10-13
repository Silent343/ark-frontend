import type { Blueprint } from "@/bounded-contexts/plan-digitization";

export type FixturePart = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotation: number;
};
export type FixtureFinish = "wood" | "fabric" | "metal" | "ceramic" | "green";

/** Low-poly assemblies share five GPU batches irrespective of the number of chairs. Dimensions follow the source footprint. */
export function buildFixtureParts(
  fixtures: NonNullable<Blueprint["fixtures"]>,
  centerX: number,
  centerY: number,
  scale: number,
) {
  const batches: Record<FixtureFinish, FixturePart[]> = {
    wood: [],
    fabric: [],
    metal: [],
    ceramic: [],
    green: [],
  };
  for (const item of fixtures) {
    const w = item.width / scale,
      d = item.depth / scale,
      h = item.height;
    const rotation = (-(item.rotation ?? 0) * Math.PI) / 180;
    const add = (
      finish: FixtureFinish,
      x: number,
      y: number,
      z: number,
      width: number,
      height: number,
      depth: number,
    ) => {
      batches[finish].push({
        x:
          (item.x - centerX) / scale +
          Math.cos(rotation) * x +
          Math.sin(rotation) * z,
        y,
        z:
          (item.y - centerY) / scale -
          Math.sin(rotation) * x +
          Math.cos(rotation) * z,
        width,
        height,
        depth,
        rotation,
      });
    };
    const legs = (top: number) => {
      for (const x of [-w * 0.38, w * 0.38])
        for (const z of [-d * 0.36, d * 0.36])
          add("metal", x, top / 2, z, 0.035, top, 0.035);
    };
    switch (item.kind) {
      case "chair":
        add("fabric", 0, h * 0.52, 0, w, 0.09, d * 0.87);
        add("fabric", 0, h * 0.78, d * 0.42, w, h * 0.44, 0.07);
        legs(h * 0.48);
        break;
      case "table":
        add("wood", 0, h - 0.045, 0, w, 0.09, d);
        legs(h - 0.09);
        break;
      case "bed":
        add("wood", 0, 0.16, 0, w, 0.26, d);
        add("fabric", 0, 0.38, 0, w * 0.97, 0.22, d * 0.97);
        add("wood", 0, 0.48, d * 0.47, w, 0.86, 0.09);
        for (const x of [-w * 0.25, w * 0.25])
          add("ceramic", x, 0.52, d * 0.28, w * 0.4, 0.1, d * 0.2);
        break;
      case "sofa":
        add("fabric", 0, h * 0.38, 0, w, h * 0.6, d);
        add("fabric", 0, h * 0.8, d * 0.4, w, h * 0.4, d * 0.2);
        for (const x of [-w * 0.46, w * 0.46])
          add("fabric", x, h * 0.6, 0, w * 0.08, h * 0.48, d);
        break;
      case "toilet":
        add("ceramic", 0, 0.2, -d * 0.12, w * 0.7, 0.4, d * 0.62);
        add("ceramic", 0, 0.42, -d * 0.12, w, 0.08, d * 0.72);
        add("ceramic", 0, 0.52, d * 0.36, w * 0.85, 0.36, d * 0.22);
        break;
      case "sink":
        add("wood", 0, h * 0.45, 0, w, h * 0.9, d);
        add("ceramic", 0, h, 0, w, 0.09, d);
        add("metal", 0, h + 0.1, d * 0.35, 0.04, 0.2, 0.04);
        break;
      case "plant":
        add("wood", 0, h * 0.18, 0, w * 0.4, h * 0.36, d * 0.4);
        add("green", 0, h * 0.65, 0, w, h * 0.7, d);
        break;
      case "vehicle":
        add("metal", 0, h * 0.4, 0, w, h * 0.48, d);
        add("ceramic", 0, h * 0.77, 0, w * 0.84, h * 0.32, d * 0.5);
        break;
      default:
        add(item.kind === "equipment" ? "metal" : "wood", 0, h / 2, 0, w, h, d);
        add("ceramic", 0, h, 0, w, 0.045, d);
    }
  }
  return batches;
}

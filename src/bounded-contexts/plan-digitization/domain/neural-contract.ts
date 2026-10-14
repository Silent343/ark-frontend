export const CORE_NEURAL_CLASSES = ["background", "wall", "door", "window"];
export const EXPANDED_NEURAL_CLASSES = [
  ...CORE_NEURAL_CLASSES,
  "cabinet",
  "equipment",
  "toilet",
  "sink",
  "bench",
  "fireplace",
  "bathtub",
  "chimney",
  "railing",
];
export const NEURAL_CLASS_LABELS: Record<string, string> = {
  wall: "Muros",
  door: "Puertas",
  window: "Ventanas",
  cabinet: "Armarios",
  equipment: "Equipos",
  toilet: "Inodoros",
  sink: "Lavabos",
  bench: "Bancos de sauna",
  fireplace: "Chimeneas de interior",
  bathtub: "Bañeras",
  chimney: "Conductos de chimenea",
  railing: "Barandas",
};
export function validNeuralModel(model: {
  id: string;
  revision: string;
  checkpointSha256: string;
  artifactSha256: string;
  usage: string;
  classes: string[];
}) {
  return (
    !!model &&
    [
      "openbim-m2-unet",
      "yytsi-resnet34-unet",
      "cubicasa-multitask-v1",
    ].includes(model.id) &&
    typeof model.revision === "string" &&
    /^(?:[a-f0-9]{40}|v1\.0\.0)$/.test(model.revision) &&
    /^[a-f0-9]{64}$/.test(model.checkpointSha256) &&
    /^[a-f0-9]{64}$/.test(model.artifactSha256) &&
    model.usage === "experimental-research" &&
    Array.isArray(model.classes) &&
    model.classes.join(",") ===
      (model.id === "cubicasa-multitask-v1"
        ? EXPANDED_NEURAL_CLASSES
        : CORE_NEURAL_CLASSES
      ).join(",")
  );
}
export interface NeuralTiling {
  tileSize: 512;
  overlapRatio: 0.2;
  tileCount: number;
  metersPerPixel: number;
  complete: true;
}
export function validNeuralTiling(t?: NeuralTiling) {
  return (
    t === undefined ||
    (!!t &&
      t.tileSize === 512 &&
      t.overlapRatio === 0.2 &&
      Number.isInteger(t.tileCount) &&
      t.tileCount >= 1 &&
      t.tileCount <= 128 &&
      Number.isFinite(t.metersPerPixel) &&
      t.metersPerPixel >= 0.005 &&
      t.metersPerPixel <= 0.1 &&
      t.complete === true)
  );
}
export interface NeuralInstance {
  id: string;
  kind: string;
  polygon: Array<[number, number]>;
  /** Network softmax score, not a calibrated probability of architectural correctness. */
  score: number;
  tileIds: string[];
  approved: boolean;
  heightM?: number;
}
export interface NeuralOpeningInstance extends NeuralInstance {
  kind: "door" | "window";
  hostStatus: "hosted" | "unhosted" | "ambiguous";
  hostWallIndex?: number;
  center?: [number, number];
  widthM?: number;
  sillM?: number;
}
/** Bounds and explicit approval are enforced on both sides of the API. */
export function validNeuralInstances(
  items: unknown,
  classes: string[],
  wallCount: number,
  opening: boolean,
  tileCount = 1,
) {
  if (items === undefined) return true;
  if (!Array.isArray(items) || items.length > 2000) return false;
  const ids = new Set<string>();
  const point = (p: unknown): p is [number, number] =>
    Array.isArray(p) &&
    p.length === 2 &&
    p.every((n) => Number.isFinite(n) && Math.abs(n) < 1e9);
  return items.every((item) => {
    if (
      !item ||
      typeof item.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(item.id) ||
      ids.has(item.id) ||
      !classes.includes(item.kind) ||
      ["background", "wall"].includes(item.kind) ||
      typeof item.approved !== "boolean" ||
      !Number.isFinite(item.score) ||
      item.score < 0 ||
      item.score > 1 ||
      !Array.isArray(item.polygon) ||
      item.polygon.length < 3 ||
      item.polygon.length > 256 ||
      !item.polygon.every(point) ||
      !Array.isArray(item.tileIds) ||
      !item.tileIds.length ||
      item.tileIds.length > 128 ||
      new Set(item.tileIds).size !== item.tileIds.length ||
      !item.tileIds.every(
        (id: unknown) =>
          typeof id === "string" &&
          /^tile-(0|[1-9][0-9]*)$/.test(id) &&
          Number(id.slice(5)) < tileCount,
      ) ||
      (item.heightM !== undefined &&
        (!Number.isFinite(item.heightM) ||
          item.heightM <= 0 ||
          item.heightM > 10))
    )
      return false;
    ids.add(item.id);
    const area =
      Math.abs(
        item.polygon.reduce((sum: number, p: [number, number], i: number) => {
          const q = item.polygon[(i + 1) % item.polygon.length];
          return sum + p[0] * q[1] - q[0] * p[1];
        }, 0),
      ) / 2;
    if (!Number.isFinite(area) || area <= 1e-12) return false;
    const polygon = item.polygon as Array<[number, number]>;
    if (new Set(polygon.map((p) => p.join(":"))).size !== polygon.length)
      return false;
    let winding = 0,
      sign = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        c = polygon[(i + 2) % polygon.length];
      const ux = b[0] - a[0],
        uy = b[1] - a[1],
        vx = c[0] - b[0],
        vy = c[1] - b[1];
      const cross = ux * vy - uy * vx;
      if (Math.abs(cross) > 1e-12) {
        if (sign && Math.sign(cross) !== sign) return false;
        sign = Math.sign(cross);
      }
      winding += Math.atan2(cross, ux * vx + uy * vy);
    }
    if (Math.abs(Math.abs(winding) - Math.PI * 2) > 1e-6) return false;
    if (opening) {
      if (
        !["door", "window"].includes(item.kind) ||
        !["hosted", "unhosted", "ambiguous"].includes(item.hostStatus)
      )
        return false;
      if (item.hostStatus === "hosted") {
        if (
          !Number.isInteger(item.hostWallIndex) ||
          item.hostWallIndex < 0 ||
          item.hostWallIndex >= wallCount ||
          !point(item.center) ||
          !Number.isFinite(item.widthM) ||
          item.widthM < 0.2 ||
          item.widthM > 8
        )
          return false;
      } else if (
        item.hostWallIndex !== undefined ||
        item.center !== undefined ||
        item.widthM !== undefined ||
        item.approved
      )
        return false;
      if (
        item.sillM !== undefined &&
        (!Number.isFinite(item.sillM) || item.sillM < 0 || item.sillM > 10)
      )
        return false;
      if (
        item.approved &&
        (item.heightM === undefined ||
          (item.kind === "window" && item.sillM === undefined))
      )
        return false;
    } else if (
      ["door", "window"].includes(item.kind) ||
      (item.approved && (item.kind === "railing" || item.heightM === undefined))
    )
      return false;
    return true;
  });
}

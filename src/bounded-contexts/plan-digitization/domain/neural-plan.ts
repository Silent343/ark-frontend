import type { CadPlan, CadRegion } from "./entities/cad-plan";
import type { PlanLine, Point2 } from "./cad-topology";
import {
  validNeuralModel,
  validNeuralTiling,
  validNeuralInstances,
  type NeuralTiling,
  type NeuralInstance,
  type NeuralOpeningInstance,
} from "./neural-contract";
import {
  reconstructWalls,
  lineDistance,
  direction,
  dot,
  project,
  distance,
} from "./cad-topology";

export interface NeuralPlanResult {
  details?: Array<Pick<NeuralPlanResult,'mask'|'scores'|'content'> & {sourceRegion:{x:number;y:number;width:number;height:number}}>;
  symbols?: import('./symbol-detection').SymbolProposal;
  width: number;
  height: number;
  mask: string;
  scores: string;
  content: { x: number; y: number; width: number; height: number };
  sourceSize: { width: number; height: number };
  overlay: string;
  counts: number[];
  elapsedMs: number;
  model: {
    id: string;
    revision: string;
    checkpointSha256: string;
    artifactSha256: string;
    usage: string;
    classes: string[];
  };
  spaces?: { classes: string[]; mask: string; scores: string };
  sourceRegion?: {x:number;y:number;width:number;height:number};
}
export interface CadNeuralAnalysis {
  tiling?: NeuralTiling;
  openings?: NeuralOpeningInstance[];
  fixtures?: NeuralInstance[];
  regionId: string;
  sourceSignature: string;
  applied: boolean;
  model: NeuralPlanResult["model"];
  overlay: string;
  elapsedMs: number;
  walls: Array<{
    a: Point2;
    b: Point2;
    thickness: number;
    sourceIds?: string[];
  }>;
  counts: number[];
}
/** Deliberately excludes analysis results and vertical edits, which do not change the source image. */
export function cadNeuralSignature(cad: CadPlan, region: CadRegion) {
  const text = JSON.stringify([
    cad.sourceName,
    cad.entities,
    cad.layers,
    cad.metersPerCadUnit,
    region.id,
    region.minX,
    region.minY,
    region.maxX,
    region.maxY,
    region.viewType ?? "plan",
  ]);
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `v1-${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

function simplify(points: Point2[], tolerance = 1.25): Point2[] {
  if (points.length <= 2) return points;
  const a = points[0],
    b = points.at(-1)!,
    dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy);
  let index = 0,
    max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i],
      distance = length
        ? Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / length
        : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (distance > max) {
      max = distance;
      index = i;
    }
  }
  return max > tolerance
    ? [
        ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
        ...simplify(points.slice(index), tolerance),
      ]
    : [a, b];
}

/** Convert a learned wall-area mask to centreline paths; unlike scanline detection, diagonals stay diagonal. */
export function vectorizeNeuralWalls(
  mask: Uint8Array,
  scores: Uint8Array,
  width: number,
  height: number,
  metersPerPixel: number,
  minimumLengthPixels?: number,
  pixelGeometry = false,
): PlanLine[] {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 3 ||
    height < 3 ||
    width > (pixelGeometry ? 1024 : 512) ||
    height > (pixelGeometry ? 1024 : 512) ||
    mask.length !== width * height ||
    scores.length !== mask.length ||
    !Number.isFinite(metersPerPixel) ||
    metersPerPixel <= 0 ||
    (minimumLengthPixels !== undefined &&
      (!Number.isFinite(minimumLengthPixels) ||
        minimumLengthPixels <= 0 ||
        minimumLengthPixels > 512))
  )
    throw new Error("Invalid neural wall grid.");
  const size = mask.length,
    binary = new Uint8Array(size),
    distance = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    binary[i] = mask[i] === 1 && scores[i] >= 140 ? 1 : 0;
    distance[i] = binary[i] ? 100000 : 0;
  }
  // Chamfer distance provides a local thickness, rather than one project-wide wall width.
  for (let y = 1; y < height; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (binary[i])
        distance[i] = Math.min(
          distance[i],
          distance[i - 1] + 1,
          distance[i - width] + 1,
          distance[i - width - 1] + Math.SQRT2,
          distance[i - width + 1] + Math.SQRT2,
        );
    }
  for (let y = height - 2; y >= 0; y--)
    for (let x = width - 2; x > 0; x--) {
      const i = y * width + x;
      if (binary[i])
        distance[i] = Math.min(
          distance[i],
          distance[i + 1] + 1,
          distance[i + width] + 1,
          distance[i + width + 1] + Math.SQRT2,
          distance[i + width - 1] + Math.SQRT2,
        );
    }
  const offsets = [
    -width,
    -width + 1,
    1,
    width + 1,
    width,
    width - 1,
    -1,
    -width - 1,
  ];
  for (let pass = 0; pass < 64; pass++) {
    let removed = 0;
    for (let phase = 0; phase < 2; phase++) {
      const remove: number[] = [];
      for (let y = 1; y < height - 1; y++)
        for (let x = 1; x < width - 1; x++) {
          const i = y * width + x;
          if (!binary[i]) continue;
          const p = offsets.map((o) => binary[i + o]),
            n = p.reduce((a, b) => a + b, 0);
          if (
            n < 2 ||
            n > 6 ||
            p.reduce((s, v, k) => s + (!v && p[(k + 1) % 8] ? 1 : 0), 0) !== 1
          )
            continue;
          if (
            phase === 0
              ? p[0] * p[2] * p[4] === 0 && p[2] * p[4] * p[6] === 0
              : p[0] * p[2] * p[6] === 0 && p[0] * p[4] * p[6] === 0
          )
            remove.push(i);
        }
      for (const i of remove) binary[i] = 0;
      removed += remove.length;
    }
    if (!removed) break;
  }
  const neighbors = (i: number) => {
    const x = i % width,
      y = Math.floor(i / width),
      result: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (
          (!dx && !dy) ||
          x + dx < 0 ||
          x + dx >= width ||
          y + dy < 0 ||
          y + dy >= height
        )
          continue;
        const n = i + dy * width + dx;
        if (
          binary[n] &&
          !(dx && dy && (binary[i + dx] || binary[i + dy * width]))
        )
          result.push(n);
      }
    return result;
  };
  const nodes = new Map<number, number[]>();
  for (let i = 0; i < size; i++) if (binary[i]) nodes.set(i, neighbors(i));
  const used = new Set<number>(),
    walls: PlanLine[] = [];
  const key = (a: number, b: number) => Math.min(a, b) * size + Math.max(a, b);
  function trace(start: number, next: number) {
    const ids = [start];
    let previous = start,
      current = next;
    for (let n = 0; n < size; n++) {
      const k = key(previous, current);
      if (used.has(k)) break;
      used.add(k);
      ids.push(current);
      const adjacent = nodes.get(current)!;
      if (adjacent.length !== 2 || current === start) break;
      const following = adjacent.find((i) => i !== previous)!;
      previous = current;
      current = following;
    }
    const widths = ids
      .map((i) => distance[i] * 2 * metersPerPixel)
      .sort((a, b) => a - b);
    const thickness = pixelGeometry ? widths[Math.floor(widths.length / 2)] : Math.max(
      0.06,
      Math.min(0.8, widths[Math.floor(widths.length / 2)]),
    );
    const points = simplify(
      ids.map((i) => [i % width, Math.floor(i / width)] as Point2),
      pixelGeometry ? Math.max(1.25, thickness / metersPerPixel * 0.3) : 1.25,
    );
    for (let i = 1; i < points.length; i++)
      if (
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1],
        ) >= (minimumLengthPixels ?? 0.25 / metersPerPixel)
      ) {
        walls.push({
          a: points[i - 1],
          b: points[i],
          thickness,
          source: `neural-${walls.length}`,
          sourceIds: [],
          paired: false,
        });
        if (walls.length > 1000)
          throw new Error(
            "La máscara propone demasiados segmentos. Recorta una planta más pequeña.",
          );
      }
  }
  for (const [i, n] of nodes)
    if (n.length !== 2)
      for (const next of n) if (!used.has(key(i, next))) trace(i, next);
  for (const [i, n] of nodes)
    for (const next of n) if (!used.has(key(i, next))) trace(i, next);
  return walls;
}

export function validCadNeural(cad: CadPlan) {
  if (cad.neural === undefined) return true;
  if (!Array.isArray(cad.neural) || cad.neural.length > 12) return false;
  const ids = new Set<string>();
  const sources = new Set(cad.entities.map((e) => e.id));
  return cad.neural.every((a) => {
    if (
      !a ||
      ids.has(a.regionId) ||
      !cad.regions.some((r) => r.id === a.regionId)
    )
      return false;
    ids.add(a.regionId);
    return (
      typeof a.sourceSignature === "string" &&
      /^v1-[a-f0-9]{16}$/.test(a.sourceSignature) &&
      typeof a.applied === "boolean" &&
      a.model &&
      validNeuralModel(a.model) &&
      validNeuralTiling(a.tiling) &&
      typeof a.model.revision === "string" &&
      /^(?:[a-f0-9]{40}|v1\.0\.0)$/.test(a.model.revision) &&
      typeof a.model.checkpointSha256 === "string" &&
      /^[a-f0-9]{64}$/.test(a.model.checkpointSha256) &&
      typeof a.model.artifactSha256 === "string" &&
      /^[a-f0-9]{64}$/.test(a.model.artifactSha256) &&
      a.model.usage === "experimental-research" &&
      Array.isArray(a.model.classes) &&
      typeof a.overlay === "string" &&
      a.overlay.length < 1_500_000 &&
      /^data:image\/png;base64,/.test(a.overlay) &&
      Number.isFinite(a.elapsedMs) &&
      a.elapsedMs >= 0 &&
      a.elapsedMs <
        (a.tiling ? 90_000 * a.tiling.tileCount + 10_000 : 180_000) &&
      Array.isArray(a.counts) &&
      a.counts.length === a.model.classes.length &&
      a.counts.every(
        (n) =>
          Number.isInteger(n) &&
          n >= 0 &&
          n <= 512 * 512 * (a.tiling?.tileCount ?? 1),
      ) &&
      Array.isArray(a.walls) &&
      a.walls.length <= 10000 &&
      validNeuralInstances(
        a.openings,
        a.model.classes,
        a.walls.length,
        true,
        a.tiling?.tileCount ?? 1,
      ) &&
      validNeuralInstances(
        a.fixtures,
        a.model.classes,
        a.walls.length,
        false,
        a.tiling?.tileCount ?? 1,
      ) &&
      a.walls.every(
        (w) =>
          w &&
          Array.isArray(w.a) &&
          Array.isArray(w.b) &&
          w.a.length === 2 &&
          w.b.length === 2 &&
          [...w.a, ...w.b, w.thickness].every(
            (n) => Number.isFinite(n) && Math.abs(n) < 1e9,
          ) &&
          w.thickness > 0 &&
          w.thickness <= 0.8 &&
          (w.sourceIds === undefined ||
            (Array.isArray(w.sourceIds) &&
              w.sourceIds.length <= 500 &&
              w.sourceIds.every((id) => sources.has(id)))),
      )
    );
  });
}

/** Preserve measured CAD centrelines supported by the network and add missing learned paths. */
export function buildNeuralCadWalls(
  cad: CadPlan,
  region: CadRegion,
  result: NeuralPlanResult,
  view: { x: number; y: number; scale: number; width: number; height: number },
  candidateWalls?: PlanLine[],
): CadNeuralAnalysis["walls"] {
  const mask = Uint8Array.from(atob(result.mask), (c) => c.charCodeAt(0)),
    scores = Uint8Array.from(atob(result.scores), (c) => c.charCodeAt(0));
  const units = cad.metersPerCadUnit,
    pixelM = (units * view.width) / result.width / view.scale;
  const learned = vectorizeNeuralWalls(
    mask,
    scores,
    result.width,
    result.height,
    pixelM,
  ).map((w) => ({
    ...w,
    a: [
      ((w.a[0] / result.width) * view.width - view.x) / view.scale,
      (view.y - (w.a[1] / result.height) * view.height) / view.scale,
    ] as Point2,
    b: [
      ((w.b[0] / result.width) * view.width - view.x) / view.scale,
      (view.y - (w.b[1] / result.height) * view.height) / view.scale,
    ] as Point2,
  }));
  const layers = new Map(cad.layers.map((l) => [l.name, l.role]));
  const raw: PlanLine[] = [];
  for (const e of candidateWalls ? [] : cad.entities) {
    if (
      e.kind !== "path" ||
      (e.role ?? layers.get(e.layer)) !== "wall" ||
      e.group?.includes("dimension")
    )
      continue;
    const points = e.points.slice();
    if (e.closed) points.push(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) {
      const a: Point2 = [points[i - 2], points[i - 1]],
        b: Point2 = [points[i], points[i + 1]];
      const x = (a[0] + b[0]) / 2,
        y = (a[1] + b[1]) / 2;
      if (
        x < region.minX ||
        x > region.maxX ||
        y < region.minY ||
        y > region.maxY
      )
        continue;
      raw.push({
        a: [a[0] * units, a[1] * units],
        b: [b[0] * units, b[1] * units],
        thickness: 0,
        source: e.id,
      });
    }
  }
  const support = (w: PlanLine) => {
    const steps = Math.max(
      3,
      Math.min(80, Math.ceil(distance(w.a, w.b) / 0.2)),
    );
    let accepted = 0;
    for (let k = 0; k <= steps; k++) {
      const x =
        ((view.x +
          ((w.a[0] + ((w.b[0] - w.a[0]) * k) / steps) / units) * view.scale) /
          view.width) *
        result.width;
      const y =
        ((view.y -
          ((w.a[1] + ((w.b[1] - w.a[1]) * k) / steps) / units) * view.scale) /
          view.height) *
        result.height;
      let present = false;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const px = Math.round(x) + dx,
            py = Math.round(y) + dy;
          if (px < 0 || py < 0 || px >= result.width || py >= result.height)
            continue;
          const i = py * result.width + px;
          if (mask[i] >= 1 && mask[i] <= 3 && scores[i] >= 140) present = true;
        }
      if (present) accepted++;
    }
    return accepted / (steps + 1);
  };
  const kept = (candidateWalls ?? reconstructWalls(raw)).filter(
    (w) => support(w) >= 0.4,
  );
  const resultWalls: CadNeuralAnalysis["walls"] = kept.map((w) => ({
    a: [w.a[0] / units, w.a[1] / units],
    b: [w.b[0] / units, w.b[1] / units],
    thickness: w.thickness,
    sourceIds: w.sourceIds ?? [w.source],
  }));
  for (const w of learned) {
    const metric = {
      ...w,
      a: [w.a[0] * units, w.a[1] * units] as Point2,
      b: [w.b[0] * units, w.b[1] * units] as Point2,
    };
    const mid: Point2 = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    if (
      mid[0] < region.minX ||
      mid[0] > region.maxX ||
      mid[1] < region.minY ||
      mid[1] > region.maxY
    )
      continue;
    if (
      kept.some(
        (k) =>
          Math.abs(dot(direction(k), direction(metric))) > 0.97 &&
          lineDistance(metric.a, k) < 0.35 &&
          lineDistance(metric.b, k) < 0.35 &&
          Math.min(project(metric.a, k), project(metric.b, k)) >= -0.35 &&
          Math.max(project(metric.a, k), project(metric.b, k)) <=
            distance(k.a, k.b) + 0.35,
      )
    )
      continue;
    resultWalls.push({ a: w.a, b: w.b, thickness: w.thickness, sourceIds: [] });
  }
  if (resultWalls.length > 1000)
    throw new Error("Demasiados segmentos propuestos; recorta una planta.");
  return resultWalls;
}

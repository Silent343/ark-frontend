import { detectPlanLines } from "./detect-plan-lines";
import type { Wall } from "../domain/entities/blueprint";

export interface RasterTile {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Covers every source pixel; last tiles stay full-sized where possible. */
export function* rasterTiles(
  width: number,
  height: number,
  size = 1024,
  overlap = 0.2,
): Generator<RasterTile> {
  if (
    ![width, height, size].every(Number.isInteger) ||
    width < 1 ||
    height < 1 ||
    size < 64 ||
    size > 1400 ||
    overlap < 0.1 ||
    overlap > 0.5
  )
    throw new Error("Invalid raster tile configuration.");
  const stride = Math.max(1, Math.floor(size * (1 - overlap)));
  function* positions(length: number) {
    let at = 0;
    yield at;
    while (at + size < length) {
      at = Math.min(at + stride, length - size);
      yield at;
    }
  }
  let id = 0;
  for (const y of positions(height))
    for (const x of positions(width))
      yield {
        id: `tile-${id++}`,
        x,
        y,
        width: Math.min(size, width),
        height: Math.min(size, height),
      };
}

/** Reconcile overlapping line instances, preserving real gaps and distinct parallel walls. */
export function fuseRasterWalls(
  input: Wall[],
  lateralTolerance = 1.25,
): Wall[] {
  const result: Wall[] = [];
  const sorted = [...input].sort(
    (a, b) =>
      Math.hypot(b.end[0] - b.start[0], b.end[1] - b.start[1]) -
      Math.hypot(a.end[0] - a.start[0], a.end[1] - a.start[1]),
  );
  let comparisons = 0;
  for (const candidate of sorted) {
    let merged = false;
    for (const wall of result) {
      if (++comparisons > 3_000_000)
        throw new Error(
          "Demasiadas propuestas raster. Delimita una planta para continuar sin perder elementos.",
        );
      const dx = wall.end[0] - wall.start[0],
        dy = wall.end[1] - wall.start[1],
        length = Math.hypot(dx, dy),
        cx = candidate.end[0] - candidate.start[0],
        cy = candidate.end[1] - candidate.start[1],
        cl = Math.hypot(cx, cy);
      if (
        !length ||
        !cl ||
        Math.abs((dx * cx + dy * cy) / (length * cl)) < 0.99995 ||
        Math.abs(wall.thickness - candidate.thickness) > 1
      )
        continue;
      const lateral = (p: [number, number]) =>
        Math.abs((p[0] - wall.start[0]) * dy - (p[1] - wall.start[1]) * dx) /
        length;
      if (
        lateral(candidate.start) > lateralTolerance ||
        lateral(candidate.end) > lateralTolerance
      )
        continue;
      const project = (p: [number, number]) =>
        ((p[0] - wall.start[0]) * dx + (p[1] - wall.start[1]) * dy) / length;
      const bounds = [project(candidate.start), project(candidate.end)].sort(
        (a, b) => a - b,
      );
      // Require common observed ink; proximity alone cannot seal an opening.
      if (bounds[1] < 0 || bounds[0] > length) continue;
      const origin = [...wall.start] as [number, number];
      wall.start = [
        origin[0] + (dx / length) * Math.min(0, bounds[0]),
        origin[1] + (dy / length) * Math.min(0, bounds[0]),
      ];
      wall.end = [
        origin[0] + (dx / length) * Math.max(length, bounds[1]),
        origin[1] + (dy / length) * Math.max(length, bounds[1]),
      ];
      merged = true;
      break;
    }
    if (!merged)
      result.push({
        ...candidate,
        start: [...candidate.start],
        end: [...candidate.end],
      });
  }
  return result.map((w, i) => ({ ...w, id: `wall-raster-${i}` }));
}

export async function detectTiledRaster(
  width: number,
  height: number,
  readTile: (tile: RasterTile) => Promise<Uint8ClampedArray>,
  options: {
    tileSize?: number;
    threshold?: number;
    onProgress?: (completed: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
) {
  const tiles = [...rasterTiles(width, height, options.tileSize)],
    proposals: Wall[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (options.signal?.aborted) throw new Error("Análisis cancelado.");
    const tile = tiles[i],
      pixels = await readTile(tile);
    proposals.push(
      ...detectPlanLines(
        pixels,
        tile.width,
        tile.height,
        options.threshold,
      ).map((w) => ({
        ...w,
        start: [w.start[0] + tile.x, w.start[1] + tile.y] as [number, number],
        end: [w.end[0] + tile.x, w.end[1] + tile.y] as [number, number],
      })),
    );
    options.onProgress?.(i + 1, tiles.length);
  }
  return {
    walls: fuseRasterWalls(proposals),
    tileCount: tiles.length,
    rawProposals: proposals.length,
    overlapRatio: 0.2,
  };
}

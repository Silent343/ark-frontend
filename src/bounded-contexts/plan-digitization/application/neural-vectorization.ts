import type { CadPlan, CadRegion } from "../domain/entities/cad-plan";
import type {
  CadNeuralAnalysis,
  NeuralPlanResult,
} from "../domain/neural-plan";
import { buildNeuralCadWalls } from "../domain/neural-plan";
import {
  reconstructWalls,
  mergeLines,
  type PlanLine,
  type Point2,
} from "../domain/cad-topology";
import {
  extractNeuralInstances,
  fuseNeuralInstances,
  associateNeuralOpening,
} from "../domain/neural-instances";
import {
  validNeuralModel,
  type NeuralInstance,
} from "../domain/neural-contract";
import type { RasterTile } from "./raster-tiles";
import { neuralTileView, neuralTiles } from "./neural-tiles";

/** Alturas arquitectónicas por defecto (en metros) para que las detecciones sean válidas en 3D sin bloqueo manual. */
const DEFAULT_FIXTURE_HEIGHTS: Record<string, number> = {
  cabinet: 0.9,
  equipment: 0.85,
  toilet: 0.78,
  sink: 0.85,
  bench: 0.45,
  fireplace: 1.1,
  bathtub: 0.6,
  chimney: 2.4,
  railing: 1.0,
};

/** Liang-Barsky: CAD axes are clipped to each metric tile before mask support is measured. */
export function clipNeuralWall(
  w: PlanLine,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): PlanLine | null {
  const dx = w.b[0] - w.a[0],
    dy = w.b[1] - w.a[1];
  let start = 0,
    end = 1;
  for (const [p, q] of [
    [-dx, w.a[0] - minX],
    [dx, maxX - w.a[0]],
    [-dy, w.a[1] - minY],
    [dy, maxY - w.a[1]],
  ]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) start = Math.max(start, t);
    else end = Math.min(end, t);
    if (start >= end) return null;
  }
  return {
    ...w,
    a: [w.a[0] + start * dx, w.a[1] + start * dy],
    b: [w.a[0] + end * dx, w.a[1] + end * dy],
  };
}

export class NeuralVectorization {
  private tiles: RasterTile[];
  private candidates: PlanLine[];
  private walls: CadNeuralAnalysis["walls"] = [];
  private instances: NeuralInstance[] = [];
  private processed = 0;
  private model?: NeuralPlanResult["model"];
  private counts: number[] = [];
  private elapsedMs = 0;

  constructor(
    private cad: CadPlan,
    private region: CadRegion,
    private metersPerPixel: number,
  ) {
    this.tiles = neuralTiles(cad, region, metersPerPixel);
    const layers = new Map(cad.layers.map((l) => [l.name, l.role])),
      raw: PlanLine[] = [];

    for (const entity of cad.entities) {
      const role = entity.role ?? layers.get(entity.layer) ?? "reference";
      // Permitimos tanto "wall" como "reference" para que la máscara neuronal descubra muros en capas sin clasificar
      if (
        entity.kind !== "path" ||
        !["wall", "reference"].includes(role) ||
        entity.group?.includes("dimension")
      )
        continue;

      const points = entity.closed
        ? [...entity.points, ...entity.points.slice(0, 2)]
        : entity.points;
      for (let i = 2; i < points.length; i += 2) {
        const units = cad.metersPerCadUnit;
        const line: PlanLine = {
          a: [points[i - 2] * units, points[i - 1] * units],
          b: [points[i] * units, points[i + 1] * units],
          thickness: 0,
          source: entity.id,
        };
        const clipped = clipNeuralWall(
          line,
          region.minX * units,
          region.minY * units,
          region.maxX * units,
          region.maxY * units,
        );
        if (clipped) raw.push(clipped);
        if (raw.length > 12000)
          throw new Error(
            "Demasiados ejes CAD para esta región. Delimita una planta menor.",
          );
      }
    }
    this.candidates = reconstructWalls(raw);
  }

  tile(result: NeuralPlanResult, index: number) {
    if (
      !validNeuralModel(result.model) ||
      !Number.isFinite(result.elapsedMs) ||
      result.elapsedMs < 0 ||
      result.elapsedMs >= 90_000
    )
      throw new Error("Respuesta del detector neuronal no válida.");
    if (index !== this.processed || !this.tiles[index])
      throw new Error("Orden de recortes neuronal no válido.");
    if (result.width !== 512 || result.height !== 512)
      throw new Error("El modelo debe devolver una máscara de 512 píxeles.");
    if (
      this.model &&
      JSON.stringify(this.model) !== JSON.stringify(result.model)
    )
      throw new Error("El modelo cambió durante el análisis.");
    this.model = result.model;

    const tile = this.tiles[index],
      view = neuralTileView(this.cad, this.region, tile, this.metersPerPixel),
      units = this.cad.metersPerCadUnit;
    const mask = Uint8Array.from(atob(result.mask), (c) => c.charCodeAt(0)),
      scores = Uint8Array.from(atob(result.scores), (c) => c.charCodeAt(0));
    if (mask.length !== 512 * 512 || scores.length !== mask.length)
      throw new Error("Máscara neuronal incompleta.");

    // Predictions outside the actual crop cannot become objects from the neighbouring drawing.
    const counts = result.model.classes.map(() => 0);
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const i = y * 512 + x;
        if (x >= tile.width || y >= tile.height) {
          mask[i] = 0;
          scores[i] = 0;
        }
        if (mask[i] >= counts.length)
          throw new Error("Categoría neuronal no válida.");
        counts[mask[i]]++;
      }

    const encode = (bytes: Uint8Array) => {
      let text = "";
      for (const byte of bytes) text += String.fromCharCode(byte);
      return btoa(text);
    };
    const adjusted = { ...result, mask: encode(mask), scores: encode(scores) };
    const minX = (-view.x / view.scale) * units,
      maxY = (view.y / view.scale) * units;
    const candidates = this.candidates.flatMap((w) => {
      const clipped = clipNeuralWall(
        w,
        minX,
        maxY - tile.height * this.metersPerPixel,
        minX + tile.width * this.metersPerPixel,
        maxY,
      );
      return clipped ? [clipped] : [];
    });

    this.walls.push(
      ...buildNeuralCadWalls(this.cad, this.region, adjusted, view, candidates),
    );
    this.instances.push(
      ...extractNeuralInstances(
        mask,
        scores,
        512,
        512,
        result.model.classes,
        `tile-${index}`,
        (p) => [(p[0] - view.x) / view.scale, (view.y - p[1]) / view.scale],
        this.metersPerPixel,
      ),
    );
    if (this.walls.length > 10000 || this.instances.length > 5000)
      throw new Error(
        "La propuesta excede el presupuesto de geometría. Delimita una región menor.",
      );
    this.counts = counts.map((n, i) => n + (this.counts[i] ?? 0));
    this.elapsedMs += result.elapsedMs;
    this.processed++;
  }

  finish() {
    if (this.processed !== this.tiles.length || !this.model)
      throw new Error("El análisis no cubrió todos los recortes.");
    const units = this.cad.metersPerCadUnit;
    const merged = mergeLines(
      this.walls.map((w, i) => ({
        ...w,
        a: w.a.map((n) => n * units) as Point2,
        b: w.b.map((n) => n * units) as Point2,
        source: `neural-${i}`,
        sourceIds: w.sourceIds ?? [],
      })),
      0,
      0.006,
    );
    const walls = merged.map((w) => ({
      a: w.a.map((n) => n / units) as Point2,
      b: w.b.map((n) => n / units) as Point2,
      thickness: w.thickness,
      sourceIds: w.sourceIds ?? [],
    }));
    const instances = fuseNeuralInstances(this.instances);
    if (instances.length > 2000)
      throw new Error(
        "Demasiados objetos propuestos. Delimita una región menor.",
      );

    const wallHeight = this.region.wallHeight ?? 2.8;

    return {
      walls,
      model: this.model,
      counts: this.counts,
      elapsedMs: this.elapsedMs,
      openings: instances
        .filter((i) => i.kind === "door" || i.kind === "window")
        .map((i) => {
          const associated = associateNeuralOpening(i, walls, units);
          const defaultHeight = Math.min(
            i.kind === "door" ? 2.1 : 1.2,
            Math.max(0.5, wallHeight - (i.kind === "window" ? 1.0 : 0.2)),
          );
          const defaultSill =
            i.kind === "window"
              ? Math.min(0.9, Math.max(0, wallHeight - defaultHeight - 0.1))
              : undefined;
          const isHosted = associated.hostStatus === "hosted";
          return {
            ...associated,
            heightM: associated.heightM ?? defaultHeight,
            ...(i.kind === "window"
              ? { sillM: associated.sillM ?? defaultSill }
              : {}),
            approved: isHosted,
          };
        }),
      fixtures: instances
        .filter((i) => i.kind !== "door" && i.kind !== "window")
        .map((i) => ({
          ...i,
          heightM: i.heightM ?? (DEFAULT_FIXTURE_HEIGHTS[i.kind] ?? 0.8),
          approved: i.kind !== "railing",
        })),
      tiling: {
        tileSize: 512 as const,
        overlapRatio: 0.2 as const,
        tileCount: this.tiles.length,
        metersPerPixel: this.metersPerPixel,
        complete: true as const,
      },
    };
  }
}
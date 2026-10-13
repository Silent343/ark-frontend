import type { Blueprint } from "./entities/blueprint";
import { metersPerUnit } from "./plan-calibration";
import { cadNeuralSignature } from "./neural-plan";

export type DetectionBox = [number, number, number, number];
export interface DetectionObject {
  id: string;
  class: string;
  bbox: DetectionBox;
  hostId?: string;
}
/** Baseline predictions in one documented metric coordinate frame. Not ground truth. */
export function modelDetectionSample(plan: Blueprint, sampleId: string) {
  const scale = metersPerUnit(plan);
  const objects: DetectionObject[] = [];
  const add = (
    id: string,
    category: string,
    points: Array<[number, number]>,
    hostId?: string,
  ) => {
    if (!points.length) return;
    const x = points.map((p) => p[0] * scale),
      y = points.map((p) => p[1] * scale);
    const bbox: DetectionBox = [
      Math.min(...x),
      Math.min(...y),
      Math.max(...x),
      Math.max(...y),
    ];
    if (bbox.every(Number.isFinite) && bbox[2] > bbox[0] && bbox[3] > bbox[1])
      objects.push({
        id,
        class: category,
        bbox,
        ...(hostId ? { hostId } : {}),
      });
  };
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    angle = 0,
  ): Array<[number, number]> =>
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) => [
      x + ((a * w) / 2) * Math.cos(angle) - ((b * h) / 2) * Math.sin(angle),
      y + ((a * w) / 2) * Math.sin(angle) + ((b * h) / 2) * Math.cos(angle),
    ]);
  for (const w of plan.walls) {
    const dx = w.end[0] - w.start[0],
      dy = w.end[1] - w.start[1];
    add(
      w.id,
      "wall",
      box(
        (w.start[0] + w.end[0]) / 2,
        (w.start[1] + w.end[1]) / 2,
        Math.hypot(dx, dy),
        w.thickness,
        Math.atan2(dy, dx),
      ),
    );
  }
  const walls = new Map(plan.walls.map((w) => [w.id, w]));
  for (const [category, items] of [
    ["door", plan.doors],
    ["window", plan.windows],
  ] as const) {
    for (const o of items) {
      const host = walls.get(o.wallId);
      add(
        o.id,
        category,
        box(
          o.x,
          o.y,
          o.width,
          host?.thickness ?? 0.15 / scale,
          (o.rotation * Math.PI) / 180,
        ),
        o.wallId,
      );
    }
  }
  for (const c of plan.columns)
    add(
      c.id,
      "column",
      box(
        c.x,
        c.y,
        c.size,
        c.depth ?? c.size,
        ((c.rotation ?? 0) * Math.PI) / 180,
      ),
    );
  for (const s of plan.stairs ?? [])
    add(
      s.id,
      "stair",
      box(
        s.x,
        s.y,
        s.radius * 2,
        s.length ?? s.radius * 2,
        ((s.rotation ?? 0) * Math.PI) / 180,
      ),
    );
  for (const f of plan.fixtures ?? [])
    add(
      f.id,
      f.kind ?? "fixture",
      box(f.x, f.y, f.width, f.depth, ((f.rotation ?? 0) * Math.PI) / 180),
    );
  for (const r of plan.rooms)
    add(r.id, "room", [
      [r.x, r.y],
      [r.x + r.width, r.y + r.height],
    ]);
  for (const s of plan.slabs ?? []) add(s.id, "slab", s.polygon);
  for (const r of plan.roofs ?? [])
    add(
      r.id,
      "roof",
      r.polygon ?? [
        [r.x, r.y],
        [r.x + r.width, r.y + r.depth],
      ],
    );
  return {
    id: sampleId,
    units: "m" as const,
    coordinateFrame: "project-xy" as const,
    objects,
  };
}

/** Separate floor samples prevent stacked floors from matching one another in 2D evaluation. */
export function modelDetectionExport(plan: Blueprint) {
  if (plan.cad ? !plan.cad.unitConfirmed : !plan.calibration)
    throw new Error(
      "Confirma la escala del plano antes de exportar detecciones métricas.",
    );
  const first = (plan.levels.find((l) => l.elevation === 0) ?? plan.levels[0])
    ?.id;
  const filter = <T extends { levelId?: string }>(items: T[], level: string) =>
    items.filter((e) => (e.levelId ?? first) === level);
  return {
    schemaVersion: 1,
    detector: {
      inputPolicy: "workspace-snapshot; source edits may be present",
      id: plan.cad
        ? Object.values(plan.elementEvidence ?? {}).some(
            (e) => e.method === "neural-mask",
          )
          ? "ark-cad-neural-hybrid"
          : "ark-cad-heuristic"
        : "ark-raster-heuristic",
      version: String(plan.reconstruction?.version ?? "local-lines-v1"),
      models: (plan.cad?.neural ?? [])
        .filter((a) => {
          const region = plan.cad!.regions.find((r) => r.id === a.regionId);
          return (
            a.applied &&
            a.walls.length > 0 &&
            region?.enabled &&
            (!region.viewType || region.viewType === "plan") &&
            a.sourceSignature === cadNeuralSignature(plan.cad!, region)
          );
        })
        .map((a) => ({
          regionId: a.regionId,
          sourceSignature: a.sourceSignature,
          ...a.model,
        })),
    },
    samples: plan.levels.map((level) =>
      modelDetectionSample(
        {
          ...plan,
          walls: filter(plan.walls, level.id),
          doors: filter(plan.doors, level.id),
          windows: filter(plan.windows, level.id),
          columns: filter(plan.columns, level.id),
          stairs: filter(plan.stairs ?? [], level.id),
          fixtures: filter(plan.fixtures ?? [], level.id),
          slabs: filter(plan.slabs ?? [], level.id),
          roofs: filter(plan.roofs ?? [], level.id),
          rooms: filter(plan.rooms, level.id),
        },
        `${plan.projectId}:${level.id}`,
      ),
    ),
  };
}

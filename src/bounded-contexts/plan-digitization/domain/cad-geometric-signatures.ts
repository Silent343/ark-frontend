import type { CadEntity, CadPlan } from "./entities/cad-plan";
import { reconstructWalls, type PlanLine, type Point2 } from "./cad-topology";

/** Geometric proposals contain evidence, not uncalibrated probabilities. */
export interface GeometricRoleProposal {
  role: "wall" | "door";
  entityIds: string[];
  signature: "parallel-faces" | "hinge-leaf-swing";
}

export function applyCadGeometricProposals(plan: CadPlan): void {
  const entities = new Map(plan.entities.map((e) => [e.id, e]));
  for (const proposal of cadGeometricProposals(plan))
    for (const id of proposal.entityIds) {
      const entity = entities.get(id);
      // Legacy explicit roles have no provenance flag: conservatively preserve them too.
      if (
        !entity ||
        entity.roleSource === "manual" ||
        (entity.role && !entity.roleSource)
      )
        continue;
      entity.role = proposal.role;
      entity.roleSource = "geometry";
    }
}
const dist = (a: Point2, b: Point2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function arcSignature(e: CadEntity, units: number) {
  if (e.kind !== "path" || e.closed || e.points.length < 12) return;
  const points: Point2[] = Array.from(
    { length: e.points.length / 2 },
    (_, i) => [e.points[2 * i] * units, e.points[2 * i + 1] * units],
  );
  const a = points[0],
    b = points[Math.floor(points.length / 2)],
    c = points.at(-1)!;
  const det =
    2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(det) < 1e-9) return;
  const norm = (p: Point2) => p[0] ** 2 + p[1] ** 2;
  const center: Point2 = [
    (norm(a) * (b[1] - c[1]) +
      norm(b) * (c[1] - a[1]) +
      norm(c) * (a[1] - b[1])) /
      det,
    (norm(a) * (c[0] - b[0]) +
      norm(b) * (a[0] - c[0]) +
      norm(c) * (b[0] - a[0])) /
      det,
  ];
  const radius = dist(center, a);
  if (
    radius < 0.45 ||
    radius > 1.8 ||
    points.some((p) => Math.abs(dist(p, center) - radius) > 0.015)
  )
    return;
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += dist(points[i - 1], points[i]);
  const sweep = length / radius;
  if (
    Math.min(Math.abs(sweep - Math.PI / 4), Math.abs(sweep - Math.PI / 2)) >
    0.035
  )
    return;
  return { center, radius, ends: [a, c] };
}

/** Layer/block names cannot override confirmed mappings. Unknown names are not a reason to skip geometry. */
export function cadGeometricProposals(plan: CadPlan): GeometricRoleProposal[] {
  if (!plan.unitConfirmed) return [];
  const proposals: GeometricRoleProposal[] = [],
    units = plan.metersPerCadUnit;
  const structuralLines: PlanLine[] = [];
  for (const layer of plan.layers) {
    if (
      layer.reviewed ||
      /cota|text|eje|demol|proyecc|hatch|relleno|defpoint/i.test(layer.name) ||
      ["roof", "electrical", "plumbing"].includes(layer.role)
    )
      continue;
    const entities = plan.entities.filter(
      (e) =>
        e.layer === layer.name &&
        e.kind === "path" &&
        !e.group?.includes("dimension"),
    );
    const lines: PlanLine[] = [];
    for (const e of entities) {
      if (e.kind !== "path") continue;
      const points = e.closed
        ? [...e.points, e.points[0], e.points[1]]
        : e.points;
      for (let i = 2; i < points.length; i += 2) {
        const a: Point2 = [points[i - 2] * units, points[i - 1] * units],
          b: Point2 = [points[i] * units, points[i + 1] * units];
        if (dist(a, b) > 0.12) lines.push({ a, b, thickness: 0, source: e.id });
      }
    }
    // Leave complex layers unresolved for regional analysis; original entities remain intact.
    if (lines.length > 15000) continue; // Leave this layer for manual mapping or regional analysis.
    const paired = reconstructWalls(lines).filter(
      (w) => w.paired && dist(w.a, w.b) > 0.25,
    );
    const connected = paired.filter((w, i) =>
      paired.some(
        (v, j) =>
          i !== j &&
          Math.min(
            dist(w.a, v.a),
            dist(w.a, v.b),
            dist(w.b, v.a),
            dist(w.b, v.b),
          ) <
            Math.max(w.thickness, v.thickness) + 0.08,
      ),
    );
    if (
      connected.length >= 4 &&
      paired.reduce((sum, w) => sum + dist(w.a, w.b), 0) > 8
    ) {
      const entityIds = [
        ...new Set(paired.flatMap((w) => w.sourceIds ?? [w.source])),
      ];
      proposals.push({ role: "wall", entityIds, signature: "parallel-faces" });
      structuralLines.push(...paired);
    } else if (layer.role === "wall") structuralLines.push(...paired);
  }
  const lineEntities = plan.entities.filter(
    (e) =>
      e.kind === "path" &&
      !e.closed &&
      e.points.length === 4 &&
      !e.group?.includes("dimension"),
  );
  const reviewed = new Set(
    plan.layers.filter((l) => l.reviewed).map((l) => l.name),
  );
  for (const e of plan.entities) {
    if (reviewed.has(e.layer) || e.group?.includes("dimension")) continue;
    const arc = arcSignature(e, units);
    if (!arc) continue;
    const leaf = lineEntities.find((line) => {
      if (line.kind !== "path") return false;
      const a: Point2 = [line.points[0] * units, line.points[1] * units],
        b: Point2 = [line.points[2] * units, line.points[3] * units];
      return (
        Math.abs(dist(a, b) - arc.radius) < 0.025 &&
        ((dist(a, arc.center) < 0.025 &&
          arc.ends.some((p) => dist(p, b) < 0.025)) ||
          (dist(b, arc.center) < 0.025 &&
            arc.ends.some((p) => dist(p, a) < 0.025)))
      );
    });
    if (!leaf || reviewed.has(leaf.layer)) continue;
    const supported = structuralLines.some((w) => {
      const dx = w.b[0] - w.a[0],
        dy = w.b[1] - w.a[1],
        len = dist(w.a, w.b);
      const t =
        ((arc.center[0] - w.a[0]) * dx + (arc.center[1] - w.a[1]) * dy) /
        len ** 2;
      return (
        t >= -0.1 &&
        t <= 1.1 &&
        Math.abs(
          (arc.center[0] - w.a[0]) * dy - (arc.center[1] - w.a[1]) * dx,
        ) /
          len <
          w.thickness + 0.06
      );
    });
    if (supported)
      proposals.push({
        role: "door",
        entityIds: [e.id, leaf.id],
        signature: "hinge-leaf-swing",
      });
  }
  return proposals;
}

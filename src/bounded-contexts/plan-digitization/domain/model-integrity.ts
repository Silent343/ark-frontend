import type { Blueprint } from "./entities/blueprint";

export type ModelIssue = {
  id: string;
  code:
    "invalid-wall" | "missing-host" | "outside-wall" | "overlapping-opening";
  detail: string;
};

/** Linear grouping plus per-host sorting; never compare every opening to every wall. */
export function modelIntegrityIssues(plan: Blueprint): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const walls = new Map(plan.walls.map((w) => [w.id, w]));
  const ground = (plan.levels.find((l) => l.elevation === 0) ?? plan.levels[0])
    ?.id;
  const intervals = new Map<
    string,
    Array<{ id: string; start: number; end: number }>
  >();
  for (const wall of plan.walls) {
    if (
      ![...wall.start, ...wall.end, wall.height, wall.thickness].every(
        Number.isFinite,
      ) ||
      wall.height <= 0 ||
      wall.thickness <= 0 ||
      Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]) <
        0.001
    )
      issues.push({
        id: wall.id,
        code: "invalid-wall",
        detail: "El muro tiene dimensiones nulas o no válidas.",
      });
  }
  for (const [kind, items] of [
    ["door", plan.doors],
    ["window", plan.windows],
  ] as const)
    for (const opening of items) {
      const host = walls.get(opening.wallId);
      if (!host || (host.levelId ?? ground) !== (opening.levelId ?? ground)) {
        issues.push({
          id: opening.id,
          code: "missing-host",
          detail: "La abertura no tiene un muro anfitrión en su mismo nivel.",
        });
        continue;
      }
      const dx = host.end[0] - host.start[0],
        dy = host.end[1] - host.start[1],
        length = Math.hypot(dx, dy);
      if (!length) continue;
      const center =
        ((opening.x - host.start[0]) * dx + (opening.y - host.start[1]) * dy) /
        length;
      const lateral =
        Math.abs(
          (opening.x - host.start[0]) * dy - (opening.y - host.start[1]) * dx,
        ) / length;
      const sill = opening.sillHeight ?? (kind === "window" ? 0.9 : 0),
        height = opening.height ?? (kind === "window" ? 1.2 : 2.1);
      const start = center - opening.width / 2,
        end = center + opening.width / 2;
      if (
        ![start, end, lateral, sill, height].every(Number.isFinite) ||
        opening.width <= 0 ||
        start < -0.5 ||
        end > length + 0.5 ||
        lateral > Math.max(0.5, host.thickness / 2) ||
        sill < 0 ||
        height <= 0 ||
        height + sill > host.height + 0.02
      )
        issues.push({
          id: opening.id,
          code: "outside-wall",
          detail:
            "La abertura excede la longitud, altura o espesor disponible de su muro.",
        });
      const group = intervals.get(host.id) ?? [];
      group.push({ id: opening.id, start, end });
      intervals.set(host.id, group);
    }
  for (const group of intervals.values()) {
    group.sort((a, b) => a.start - b.start);
    let end = -Infinity;
    for (const item of group) {
      if (item.start < end - 0.5)
        issues.push({
          id: item.id,
          code: "overlapping-opening",
          detail: "Hay aberturas superpuestas sobre el mismo muro.",
        });
      end = Math.max(end, item.end);
    }
  }
  return issues;
}

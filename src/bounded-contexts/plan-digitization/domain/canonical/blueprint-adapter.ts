import type { Blueprint } from "../entities/blueprint";
import { metersPerUnit } from "../plan-calibration";
import { familyForFixture, validFamilyAssignment } from "../fixture-families";
import { buildPlanarGraph } from "./planar-graph";
import { polygonProblem } from "./polygon-validation";
import { contains, signedArea } from "../cad-topology";
import type {
  ArchitecturalElement,
  CanonicalFloorPlanGraph,
  CanonicalIssue,
  CanonicalOpening,
  CanonicalWall,
  DimensionValue,
  Point2,
  Point3,
  SourceReference,
} from "./types";

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const validPoint = (p: number[]) => p.length === 2 && p.every(finite);
const fallback = <T>(value: T | null): DimensionValue<T> => ({
  value,
  source: value === null ? "unresolved" : "inferred_fallback",
  confidence: null,
  status: value === null ? "missing" : "proposed",
  evidence: [],
});

/** One adapter for the shared output of both import pipelines; never mutates saved source geometry. */
export function canonicalFromBlueprint(
  plan: Blueprint,
  appliedCorrespondenceIds: string[] = [],
): CanonicalFloorPlanGraph {
  const ratio = metersPerUnit(plan),
    ground =
      (plan.levels.find((l) => l.elevation === 0) ?? plan.levels[0])?.id ?? "";
  const metric = ([x, y]: Point2): Point2 => [x * ratio, -y * ratio];
  const issues: CanonicalIssue[] = [];
  const issue = (
    code: string,
    id: string,
    message: string,
    severity: CanonicalIssue["severity"] = "blocking",
  ) => issues.push({ code, elementIds: id ? [id] : [], message, severity });
  const graph: CanonicalFloorPlanGraph = {
    schemaVersion: "1.0",
    coordinateSystem: "right-handed-z-up-meters",
    sourceKind: plan.cad
      ? "cad"
      : plan.sourceImage || plan.sheets?.length
        ? "raster"
        : "manual",
    unitsConfirmed: plan.cad ? plan.cad.unitConfirmed : !!plan.calibration,
    levels: [],
    elements: [],
    issues,
  };
  if (!graph.unitsConfirmed || !finite(ratio) || ratio <= 0) {
    issue(
      "units-pending",
      "",
      "Confirma las unidades o calibra una distancia en el plano 2D.",
    );
    return graph;
  }
  if (!plan.levels.length)
    issue("levels-missing", "", "Selecciona al menos un nivel del edificio.");
  const ids = new Set<string>();
  const appliedReferences = new Set(appliedCorrespondenceIds);
  const sheets = new Map(plan.sheets?.map((s) => [s.id, s]));
  const elementSheets = new Map(
    [
      ...plan.walls,
      ...plan.doors,
      ...plan.windows,
      ...plan.columns,
      ...plan.rooms,
      ...(plan.stairs ?? []),
      ...(plan.slabs ?? []),
      ...(plan.roofs ?? []),
      ...(plan.services ?? []),
    ].map((e) => [e.id, e.sheetId ? sheets.get(e.sheetId) : undefined]),
  );
  const acceptId = (id: string, levelId?: string) => {
    if (!id || ids.has(id)) {
      issue("duplicate-id", id, "Hay identificadores duplicados en el modelo.");
      return false;
    }
    ids.add(id);
    if (!plan.levels.some((l) => l.id === (levelId ?? ground))) {
      issue(
        "missing-level",
        id,
        "El elemento no pertenece a un nivel existente.",
      );
      return false;
    }
    return true;
  };
  const evidence = (id: string): SourceReference[] => {
    const entry = plan.elementEvidence?.[id];
    const sheet = elementSheets.get(id);
    return [
      {
        documentId:
          sheet?.id ??
          entry?.sourceName ??
          plan.cad?.sourceName ??
          plan.review?.sourceName ??
          plan.projectId,
        documentName:
          sheet?.sourceName ??
          entry?.sourceName ??
          plan.cad?.sourceName ??
          plan.review?.sourceName,
        viewId: entry?.regionId ?? sheet?.id,
        entityIds: entry?.sourceIds ?? [id],
      },
    ];
  };
  const dimension = (
    id: string,
    property: string,
    value: number | undefined,
    measured = false,
  ): DimensionValue<number> => {
    const d = fallback(finite(value) ? value : null);
    d.evidence = evidence(id);
    const explicitlyAssumed =
      plan.elementEvidence?.[id]?.assumed.includes(property);
    if (d.value !== null && measured && !explicitlyAssumed) {
      d.source = "explicit_plan";
      d.status = "proposed";
    }
    if (
      d.value !== null &&
      !explicitlyAssumed &&
      plan.review?.reviewedIds.includes(id)
    ) {
      d.source = "manual_confirmation";
      d.status = "confirmed";
    }
    const reference = plan.correspondences?.find(
      (r) =>
        appliedReferences.has(r.id) &&
        r.targetId === id &&
        r.property === property &&
        d.value !== null &&
        Math.abs(r.valueM - d.value) < 1e-8,
    );
    if (reference) {
      const sheet =
        reference.source.kind === "sheet"
          ? sheets.get(reference.source.viewId)
          : undefined;
      const region = plan.cad?.regions.find(
        (r) => r.id === reference.source.viewId,
      );
      d.source =
        (sheet?.viewType ?? region?.viewType) === "schedule"
          ? "schedule_table"
          : "section_cross_ref";
      d.status = "confirmed";
      d.evidence.push({
        documentId: sheet?.id ?? plan.cad?.sourceName ?? plan.projectId,
        documentName: sheet?.sourceName ?? plan.cad?.sourceName,
        viewId: reference.source.viewId,
        entityIds: [reference.source.textId],
      });
    }
    return d;
  };
  const base = (e: { id: string; levelId?: string }) => ({
    id: e.id,
    levelId: e.levelId ?? ground,
    evidence: evidence(e.id),
    status: plan.review?.reviewedIds.includes(e.id)
      ? ("confirmed" as const)
      : ("proposed" as const),
  });
  for (const w of plan.walls) {
    if (!acceptId(w.id, w.levelId)) continue;
    if (
      !validPoint(w.start) ||
      !validPoint(w.end) ||
      !finite(w.thickness) ||
      w.thickness <= 0 ||
      !finite(w.height) ||
      w.height <= 0 ||
      Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]) * ratio < 0.001
    ) {
      issue(
        "invalid-wall",
        w.id,
        "El muro tiene un eje o unas dimensiones no válidos.",
      );
      continue;
    }
    graph.elements.push({
      ...base(w),
      kind: "wall",
      axis: [{ kind: "line", start: metric(w.start), end: metric(w.end) }],
      sections: [
        {
          position: 0,
          thickness: dimension(w.id, "thickness", w.thickness * ratio, true),
          height: dimension(w.id, "height", w.height),
        },
      ],
    });
  }
  const walls = new Map(
    graph.elements
      .filter((e): e is CanonicalWall => e.kind === "wall")
      .map((w) => [w.id, w]),
  );
  for (const [kind, openings] of [
    ["door", plan.doors],
    ["window", plan.windows],
  ] as const)
    for (const o of openings) {
      if (!acceptId(o.id, o.levelId)) continue;
      const wall = walls.get(o.wallId),
        axis = wall?.axis[0];
      if (
        !wall ||
        axis?.kind !== "line" ||
        wall.levelId !== (o.levelId ?? ground)
      ) {
        issue(
          "missing-host",
          o.id,
          "La abertura no tiene un muro anfitrión válido en su nivel.",
        );
        continue;
      }
      if (!finite(o.x) || !finite(o.y) || !finite(o.width) || o.width <= 0) {
        issue(
          "invalid-opening",
          o.id,
          "La abertura tiene coordenadas o ancho no válidos.",
        );
        continue;
      }
      const center = metric([o.x, o.y]),
        dx = axis.end[0] - axis.start[0],
        dy = axis.end[1] - axis.start[1],
        length = Math.hypot(dx, dy);
      const offset: Point2 = [
        center[0] - axis.start[0],
        center[1] - axis.start[1],
      ];
      const positionOnWall = (offset[0] * dx + offset[1] * dy) / length,
        lateral = Math.abs(offset[0] * dy - offset[1] * dx) / length;
      const opening: CanonicalOpening = {
        ...base(o),
        kind,
        hostWallId: wall.id,
        positionOnWall,
        center,
        width: dimension(o.id, "width", o.width * ratio, true),
        height: dimension(o.id, "height", o.height),
        sillHeight: dimension(
          o.id,
          "sillHeight",
          o.sillHeight ?? (kind === "door" ? 0 : undefined),
        ),
        family:
          fallback<NonNullable<CanonicalOpening["family"]["value"]>>(null),
      };
      const width = o.width * ratio,
        h = opening.height.value,
        sill = opening.sillHeight.value;
      if (
        positionOnWall - width / 2 < -0.02 ||
        positionOnWall + width / 2 > length + 0.02 ||
        lateral > (wall.sections[0].thickness.value ?? 0) / 2 + 0.02
      )
        issue(
          "opening-outside-host",
          o.id,
          "La abertura está fuera de la longitud o el espesor de su muro.",
        );
      if (
        (h !== null && (!finite(h) || h <= 0)) ||
        (sill !== null && (!finite(sill) || sill < 0)) ||
        (h !== null &&
          sill !== null &&
          h + sill > (wall.sections[0].height.value ?? 0) + 0.02)
      )
        issue(
          "opening-height-conflict",
          o.id,
          "La altura de la abertura es incompatible con el muro.",
        );
      graph.elements.push(opening);
    }
  const intervals = new Map<string, CanonicalOpening[]>();
  for (const e of graph.elements)
    if (e.kind === "door" || e.kind === "window")
      intervals.set(e.hostWallId, [...(intervals.get(e.hostWallId) ?? []), e]);
  for (const group of intervals.values()) {
    group.sort(
      (a, b) =>
        a.positionOnWall -
        (a.width.value ?? 0) / 2 -
        b.positionOnWall +
        (b.width.value ?? 0) / 2,
    );
    let end = -Infinity;
    for (const o of group) {
      const half = (o.width.value ?? 0) / 2;
      if (o.positionOnWall - half < end - 0.005)
        issue(
          "opening-overlap",
          o.id,
          "Hay aberturas superpuestas en el mismo muro.",
        );
      end = Math.max(end, o.positionOnWall + half);
    }
  }
  const rectangle = (
    x: number,
    y: number,
    width: number,
    depth: number,
    rotation = 0,
  ): Point2[] => {
    const c = Math.cos(rotation),
      s = Math.sin(rotation);
    return [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2],
    ].map(([a, b]) => metric([x + a * c - b * s, y + a * s + b * c]));
  };
  for (const c of plan.columns) {
    if (!acceptId(c.id, c.levelId)) continue;
    if (
      ![c.x, c.y, c.size, c.depth ?? c.size, c.rotation ?? 0].every(finite) ||
      c.size <= 0 ||
      (c.depth ?? c.size) <= 0
    ) {
      issue("invalid-column", c.id, "La columna tiene una sección no válida.");
      continue;
    }
    graph.elements.push({
      ...base(c),
      kind: "column",
      footprint: {
        outer: rectangle(
          c.x,
          c.y,
          c.size,
          c.depth ?? c.size,
          (-(c.rotation ?? 0) * Math.PI) / 180,
        ),
        holes: [],
      },
      height: dimension(c.id, "height", c.height),
    });
  }
  for (const [kind, surfaces] of [
    ["slab", plan.slabs ?? []],
    ["roof", plan.roofs ?? []],
  ] as const)
    for (const s of surfaces) {
      if (!acceptId(s.id, s.levelId)) continue;
      const roof = "x" in s ? s : undefined;
      const polygon =
        s.polygon ??
        (roof
          ? ([
              [roof.x, roof.y],
              [roof.x + roof.width, roof.y],
              [roof.x + roof.width, roof.y + roof.depth],
              [roof.x, roof.y + roof.depth],
            ] as Point2[])
          : []);
      const holes = "holes" in s ? s.holes : [];
      if (
        polygon.length < 3 ||
        !polygon.every(validPoint) ||
        holes.some((h) => h.length < 3 || !h.every(validPoint)) ||
        !finite(s.thickness) ||
        s.thickness <= 0
      ) {
        issue(
          "invalid-surface",
          s.id,
          "La superficie tiene un contorno o espesor no válidos.",
        );
        continue;
      }
      const problem = polygonProblem({
        outer: polygon.map(metric),
        holes: holes.map((h) => h.map(metric)),
      });
      if (problem) {
        issue("invalid-surface-topology", s.id, problem);
        continue;
      }
      graph.elements.push({
        ...base(s),
        kind,
        footprint: {
          outer: polygon.map(metric),
          holes: holes.map((h) => h.map(metric)),
        },
        thickness: dimension(s.id, "thickness", s.thickness),
        elevation: dimension(s.id, "elevation", roof?.elevation ?? 0, !roof),
        slope: fallback<Point2>(null),
      });
    }
  for (const f of plan.fixtures ?? []) {
    if (!acceptId(f.id, f.levelId)) continue;
    if (
      ![f.x, f.y, f.width, f.depth, f.height].every(finite) ||
      f.width <= 0 ||
      f.depth <= 0 ||
      f.height <= 0
    ) {
      issue(
        "invalid-furniture",
        f.id,
        "El mobiliario tiene dimensiones no válidas.",
      );
      continue;
    }
    const selection = plan.fixtureFamilies?.[f.id];
    const representation =
      validFamilyAssignment(selection) &&
      familyForFixture(f, plan.fixtureFamilies)?.id === selection.familyId
        ? selection
        : undefined;
    graph.elements.push({
      ...base(f),
      kind: "furniture",
      category: f.kind ?? "unclassified",
      catalogId: representation?.familyId ?? null,
      representation,
      footprint: {
        outer: rectangle(
          f.x,
          f.y,
          f.width,
          f.depth,
          (-(f.rotation ?? 0) * Math.PI) / 180,
        ),
        holes: [],
      },
      height: dimension(f.id, "height", f.height),
    });
  }
  for (const s of plan.stairs ?? []) {
    if (!acceptId(s.id, s.levelId)) continue;
    if (![s.x, s.y, s.radius].every(finite) || s.radius <= 0) {
      issue(
        "invalid-stair",
        s.id,
        "La escalera tiene una geometría no válida.",
      );
      continue;
    }
    graph.elements.push({
      ...base(s),
      kind: "stair",
      configuration: { ...fallback(s.type), evidence: evidence(s.id) },
      flights: [
        {
          path: [],
          width: dimension(s.id, "width", 2 * s.radius * ratio, true),
          rise: dimension(s.id, "rise", s.rise),
          stepCount: dimension(s.id, "stepCount", s.stepCount),
        },
      ],
      landings: [],
      railings: [],
    });
  }
  // MEP XY positions are known; their Z and network sections remain explicitly unresolved.
  for (const discipline of ["electrical", "water", "drainage"] as const) {
    const points = (plan.services ?? []).filter((p) =>
      discipline === "electrical"
        ? ["outlet", "switch", "light", "panel"].includes(p.kind)
        : p.kind === (discipline === "drainage" ? "drain" : "water"),
    );
    for (const level of plan.levels) {
      const members = points.filter((p) => p.levelId === level.id);
      if (!members.length) continue;
      const memberIds = new Set(members.map((p) => p.id));
      graph.elements.push({
        id: `network-${discipline}-${level.id}`,
        levelId: level.id,
        evidence: [],
        status: "proposed",
        kind: "mep-network",
        discipline,
        nodes: members.map((p) => ({
          id: p.id,
          planPosition: metric([p.x, p.y]),
          position: fallback<Point3>(null),
          equipmentType: p.kind,
        })),
        segments: (plan.routes ?? [])
          .filter(
            (r) =>
              r.levelId === level.id &&
              memberIds.has(r.fromId) &&
              memberIds.has(r.toId),
          )
          .map((r) => ({
            id: r.id,
            fromId: r.fromId,
            toId: r.toId,
            route: fallback<Point3[]>(null),
            section: fallback<
              { diameter: number } | { width: number; height: number }
            >(null),
          })),
      });
    }
  }
  for (const level of plan.levels) {
    if (!acceptId(level.id, level.id)) continue;
    if (!finite(level.elevation)) {
      issue(
        "invalid-level",
        level.id,
        "El nivel tiene una elevación no válida.",
      );
      continue;
    }
    const levelWalls = [...walls.values()].filter(
      (w) => w.levelId === level.id,
    );
    graph.levels.push({
      id: level.id,
      name: level.name,
      elevation: dimension(level.id, "elevation", level.elevation),
      topology: buildPlanarGraph(
        levelWalls.flatMap((w) =>
          w.axis.flatMap((c) =>
            c.kind === "line"
              ? [{ start: c.start, end: c.end, wallId: w.id }]
              : [],
          ),
        ),
      ),
    });
  }
  for (const room of plan.rooms) {
    if (!acceptId(room.id, room.levelId)) continue;
    if (
      ![room.x, room.y, room.width, room.height].every(finite) ||
      room.width <= 0 ||
      room.height <= 0
    ) {
      issue(
        "invalid-space",
        room.id,
        "El ambiente tiene dimensiones no válidas.",
      );
      continue;
    }
    const level = graph.levels.find((l) => l.id === (room.levelId ?? ground));
    const center = metric([room.x + room.width / 2, room.y + room.height / 2]);
    const expectedArea =
      finite(room.area) && room.area > 0
        ? room.area
        : room.width * room.height * ratio ** 2;
    const face = level?.topology.faces.find(
      (f) =>
        !f.exterior &&
        contains(center, f.polygon.outer) &&
        !f.polygon.holes.some((h) => contains(center, h)) &&
        Math.abs(
          Math.abs(signedArea(f.polygon.outer)) -
            f.polygon.holes.reduce(
              (sum, h) => sum + Math.abs(signedArea(h)),
              0,
            ) -
            expectedArea,
        ) <= Math.max(0.05, expectedArea * 0.03),
    );
    graph.elements.push({
      ...base(room),
      kind: "space",
      name: { ...fallback(room.name), evidence: evidence(room.id) },
      boundaryFaceId: face?.id ?? null,
      footprint: face?.polygon ?? null,
    });
    if (!face)
      issue(
        "space-boundary-unresolved",
        room.id,
        "El ambiente no tiene un contorno topológico compatible; conserva su nombre para revisión.",
        "warning",
      );
  }
  const assumed = graph.elements.filter((e) =>
    dimensionsOf(e).some(
      (d) => d.source === "inferred_fallback" || d.source === "unresolved",
    ),
  );
  if (assumed.length)
    issues.push({
      code: "dimensions-pending",
      severity: "warning",
      elementIds: assumed.map((e) => e.id),
      message: `${assumed.length} elementos contienen dimensiones o familias pendientes de confirmar.`,
    });
  return graph;
}

export function dimensionsOf(
  e: ArchitecturalElement,
): DimensionValue<unknown>[] {
  switch (e.kind) {
    case "wall":
      return e.sections.flatMap((s) => [s.thickness, s.height]);
    case "door":
    case "window":
      return [e.width, e.height, e.sillHeight, e.family];
    case "slab":
    case "roof":
      return [e.thickness, e.elevation, e.slope];
    case "column":
    case "furniture":
      return [e.height];
    case "space":
      return [e.name];
    case "stair":
      return [
        e.configuration,
        ...e.flights.flatMap((f) => [f.width, f.rise, f.stepCount]),
      ];
    case "beam":
      return [e.section];
    case "foundation":
      return [e.family, e.depth];
    case "mep-network":
      return [
        ...e.nodes.map((n) => n.position),
        ...e.segments.flatMap((s) => [s.route, s.section]),
      ];
  }
}

/** Renderer compatibility boundary. The IR is derived, never persisted as a second source of truth. */
export function canonicalRenderBlueprint(
  graph: CanonicalFloorPlanGraph,
  source: Blueprint,
): Blueprint {
  if (graph.issues.some((i) => i.severity === "blocking"))
    throw new Error(
      "Resuelve los conflictos del modelo antes de reconstruirlo.",
    );
  const ratio = metersPerUnit(source),
    wallSources = new Map(source.walls.map((w) => [w.id, w]));
  return {
    ...source,
    walls: graph.elements.flatMap((e) => {
      if (e.kind !== "wall") return [];
      const line = e.axis[0],
        original = wallSources.get(e.id),
        section = e.sections[0];
      if (!original || line?.kind !== "line" || e.axis.length !== 1)
        throw new Error(
          "El renderizador de compatibilidad no admite todavía este muro curvo.",
        );
      return [
        {
          ...original,
          start: [line.start[0] / ratio, -line.start[1] / ratio] as Point2,
          end: [line.end[0] / ratio, -line.end[1] / ratio] as Point2,
          height: section.height.value!,
          thickness: section.thickness.value! / ratio,
        },
      ];
    }),
  };
}

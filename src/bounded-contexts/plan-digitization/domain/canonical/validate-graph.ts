import type { CanonicalFloorPlanGraph, DimensionValue, Point2 } from "./types";
import { dimensionsOf } from "./blueprint-adapter";
import { polygonProblem } from "./polygon-validation";

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Grafo canónico no válido: ${message}`);
}
const point = (p: Point2) =>
  Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
function dimension(d: DimensionValue<unknown>) {
  requireCondition(
    d &&
      [
        "explicit_plan",
        "section_cross_ref",
        "schedule_table",
        "inferred_fallback",
        "manual_confirmation",
        "unresolved",
      ].includes(d.source),
    "procedencia de dimensión",
  );
  requireCondition(
    ["proposed", "confirmed", "conflicting", "missing"].includes(d.status),
    "estado de dimensión",
  );
  requireCondition(
    d.value !== null || d.status === "missing",
    "dimensión ausente sin estado pendiente",
  );
  requireCondition(
    typeof d.value !== "number" || Number.isFinite(d.value),
    "dimensión no finita",
  );
  requireCondition(
    d.confidence === null ||
      (Number.isFinite(d.confidence) &&
        d.confidence >= 0 &&
        d.confidence <= 1 &&
        !!d.calibrationId),
    "confianza sin calibración identificada",
  );
}

/** Validates incidence and geometry contracts at the IR → renderer boundary. */
export function validateCanonicalGraph(graph: CanonicalFloorPlanGraph): void {
  requireCondition(
    graph.schemaVersion === "1.0" &&
      graph.coordinateSystem === "right-handed-z-up-meters",
    "versión o coordenadas",
  );
  const ids = new Set<string>(),
    levelIds = new Set(graph.levels.map((l) => l.id));
  requireCondition(levelIds.size === graph.levels.length, "niveles duplicados");
  for (const e of graph.elements) {
    requireCondition(e.id && !ids.has(e.id), "elementos duplicados");
    ids.add(e.id);
    requireCondition(levelIds.has(e.levelId), "nivel inexistente");
    dimensionsOf(e).forEach(dimension);
    if (e.kind === "wall") {
      requireCondition(
        e.axis.length && e.sections.length,
        "muro sin trayectoria o sección",
      );
      for (const c of e.axis) {
        if (c.kind === "line")
          requireCondition(
            point(c.start) &&
              point(c.end) &&
              Math.hypot(c.end[0] - c.start[0], c.end[1] - c.start[1]) > 0,
            "eje de muro degenerado",
          );
        if (c.kind === "arc")
          requireCondition(
            point(c.center) &&
              Number.isFinite(c.radius) &&
              c.radius > 0 &&
              Number.isFinite(c.startAngle) &&
              Number.isFinite(c.sweepAngle) &&
              c.sweepAngle !== 0,
            "arco degenerado",
          );
        if (c.kind === "bezier")
          requireCondition(
            c.controlPoints.length === 4 && c.controlPoints.every(point),
            "curva Bézier no válida",
          );
      }
      for (const s of e.sections)
        requireCondition(
          Number.isFinite(s.position) &&
            s.position >= 0 &&
            s.position <= 1 &&
            (s.thickness.value === null || s.thickness.value > 0) &&
            (s.height.value === null || s.height.value > 0),
          "sección de muro no válida",
        );
    }
    if (e.kind === "door" || e.kind === "window")
      requireCondition(
        point(e.center) && Number.isFinite(e.positionOnWall),
        "posición de abertura no válida",
      );
    if (e.kind === "mep-network") {
      const nodes = new Set(e.nodes.map((n) => n.id));
      requireCondition(
        nodes.size === e.nodes.length &&
          e.nodes.every((n) => point(n.planPosition)),
        "nodos de instalaciones no válidos",
      );
      requireCondition(
        e.segments.every(
          (s) =>
            nodes.has(s.fromId) && nodes.has(s.toId) && s.fromId !== s.toId,
        ),
        "conexiones de instalaciones no válidas",
      );
    }
    if ("footprint" in e && e.footprint !== null)
      requireCondition(
        polygonProblem(e.footprint) === null,
        "contorno no válido",
      );
  }
  const walls = new Map(
    graph.elements.filter((e) => e.kind === "wall").map((e) => [e.id, e]),
  );
  for (const e of graph.elements)
    if (e.kind === "door" || e.kind === "window")
      requireCondition(
        walls.get(e.hostWallId)?.levelId === e.levelId,
        "anfitrión inexistente o de otro nivel",
      );
  for (const level of graph.levels) {
    dimension(level.elevation);
    const t = level.topology,
      nodes = new Map(t.nodes.map((n) => [n.id, n])),
      edges = new Map(t.halfEdges.map((e) => [e.id, e])),
      faces = new Map(t.faces.map((f) => [f.id, f]));
    requireCondition(
      nodes.size === t.nodes.length &&
        edges.size === t.halfEdges.length &&
        faces.size === t.faces.length,
      "identificadores topológicos duplicados",
    );
    for (const n of nodes.values())
      requireCondition(point(n.position), "nodo no finito");
    for (const e of edges.values()) {
      const twin = edges.get(e.twin),
        next = edges.get(e.next),
        previous = edges.get(e.previous);
      requireCondition(
        nodes.has(e.origin) &&
          twin?.twin === e.id &&
          twin.origin !== e.origin &&
          next?.previous === e.id &&
          previous?.next === e.id &&
          next.origin === twin.origin &&
          faces.has(e.face) &&
          next.face === e.face,
        "incidencia de semiaristas inconsistente",
      );
      requireCondition(
        e.wallIds.length &&
          e.wallIds.every((id) => walls.get(id)?.levelId === level.id),
        "arista sin muro del nivel",
      );
    }
    for (const f of faces.values()) {
      requireCondition(
        edges.get(f.boundary)?.face === f.id &&
          f.innerBoundaries.every((id) => edges.get(id)?.face === f.id),
        "contorno de cara no válido",
      );
      requireCondition(
        f.polygon.outer.every(point) &&
          f.polygon.holes.every((h) => h.every(point)),
        "cara no finita",
      );
    }
  }
}

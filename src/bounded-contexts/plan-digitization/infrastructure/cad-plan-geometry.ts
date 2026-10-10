import type { CadDocument, Entity } from "@node-projects/acad-ts";
import type { CadEntity } from "../domain/entities/cad-plan";

type CadModule = typeof import("@node-projects/acad-ts");

export interface CadLayerPreview {
  name: string;
  visible: boolean;
  count: number;
}
export type CadShape = CadEntity;
export interface CadDrawingPreview {
  shapes: CadShape[];
  layers: CadLayerPreview[];
  skipped: Record<string, number>;
}

const MAX_SHAPES = 220_000;
const MAX_POINTS_PER_PATH = 256;
const finitePoint = (x: number, y: number) =>
  Number.isFinite(x) &&
  Number.isFinite(y) &&
  Math.abs(x) < 1e9 &&
  Math.abs(y) < 1e9;

/** Keep CAD semantics and layer visibility for review; this is a 2D preview, not BIM conversion. */
export function extractCadDrawing(
  document: CadDocument,
  cad: CadModule,
): CadDrawingPreview {
  const shapes: CadShape[] = [];
  const skipped: Record<string, number> = {};
  const layers = new Map<string, CadLayerPreview>();
  for (const layer of document.layers ?? [])
    layers.set(layer.name, {
      name: layer.name,
      visible: layer.isOn,
      count: 0,
    });

  function colorOf(entity: Entity): string {
    try {
      const rgb = entity.getActiveColor().getRgb();
      if (rgb?.length === 3 && rgb.every((value) => Number.isFinite(value))) {
        // CAD white is usually drawn on black; remap only near-white ink for this light sheet.
        if (rgb.every((value) => value > 210)) return "#374151";
        return `rgb(${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value)))).join(",")})`;
      }
    } catch {
      /* A malformed BYBLOCK/BYLAYER reference must not discard its geometry. */
    }
    return "#374151";
  }

  function unsupportedKind(entity: Entity) {
    // Constructor names are minified in the browser bundle; DXF subclass names stay stable.
    if (entity instanceof cad.Hatch) return "Hatch";
    if (entity instanceof cad.Wipeout) return "Wipeout";
    return entity.subclassMarker?.replace(/^AcDb/, "") || "Other";
  }

  function add(
    entity: Entity,
    inheritedLayer?: string,
    depth = 0,
    group?: string,
  ) {
    if (shapes.length >= MAX_SHAPES) {
      skipped.limit = (skipped.limit ?? 0) + 1;
      return;
    }
    if (entity.isInvisible || depth > 3) return;
    const layer =
      entity.layer?.name === "0" && inheritedLayer
        ? inheritedLayer
        : (entity.layer?.name ?? inheritedLayer ?? "0");
    const color = colorOf(entity);
    const identity = { id: `cad-${shapes.length}`, group, layer, color };
    const currentLayer = layers.get(layer) ?? {
      name: layer,
      visible: true,
      count: 0,
    };
    currentLayer.count++;
    layers.set(layer, currentLayer);

    if (entity instanceof cad.Insert) {
      try {
        for (const child of entity.explode())
          add(child, layer, depth + 1, group ?? `block-${entity.handle}`);
      } catch {
        skipped.Insert = (skipped.Insert ?? 0) + 1;
      }
      return;
    }
    if (entity instanceof cad.Dimension) {
      if (entity.block)
        for (const child of entity.block.entities)
          add(child, layer, depth + 1, group ?? `dimension-${entity.handle}`);
      else skipped.Dimension = (skipped.Dimension ?? 0) + 1;
      return;
    }
    if (entity instanceof cad.Line) {
      const { startPoint: a, endPoint: b } = entity;
      if (finitePoint(a.x, a.y) && finitePoint(b.x, b.y))
        shapes.push({
          ...identity,
          kind: "path",
          points: [a.x, a.y, b.x, b.y],
          closed: false,
        });
      return;
    }
    if (entity instanceof cad.TextEntity || entity instanceof cad.MText) {
      const point = entity.insertPoint;
      const value = (
        entity instanceof cad.MText ? entity.plainText : entity.value
      )
        .replace(/\\P/g, " ")
        .trim()
        .slice(0, 200);
      if (value && finitePoint(point.x, point.y))
        shapes.push({
          ...identity,
          kind: "text",
          x: point.x,
          y: point.y,
          height: Math.max(0.01, Math.min(100, entity.height || 0.1)),
          rotation: entity.rotation || 0,
          value,
        });
      return;
    }
    if (entity instanceof cad.Circle && !(entity instanceof cad.Arc)) {
      if (
        finitePoint(entity.center.x, entity.center.y) &&
        Number.isFinite(entity.radius) &&
        entity.radius > 0 &&
        entity.radius < 1e8
      )
        shapes.push({
          ...identity,
          kind: "circle",
          x: entity.center.x,
          y: entity.center.y,
          radius: entity.radius,
        });
      return;
    }
    if (
      entity instanceof cad.Arc ||
      entity instanceof cad.Ellipse ||
      entity instanceof cad.LwPolyline ||
      entity instanceof cad.Polyline2D ||
      entity instanceof cad.Spline
    ) {
      try {
        const sampled =
          entity instanceof cad.LwPolyline || entity instanceof cad.Polyline2D
            ? entity.getPoints(24)
            : entity.polygonalVertexes(48);
        const points: number[] = [];
        for (const point of sampled.slice(0, MAX_POINTS_PER_PATH))
          if (finitePoint(point.x, point.y)) points.push(point.x, point.y);
        if (points.length >= 4)
          shapes.push({
            ...identity,
            kind: "path",
            points,
            closed:
              entity instanceof cad.LwPolyline ||
              entity instanceof cad.Polyline2D
                ? entity.isClosed
                : entity instanceof cad.Ellipse
                  ? entity.isFullEllipse
                  : false,
          });
      } catch {
        const kind = unsupportedKind(entity);
        skipped[kind] = (skipped[kind] ?? 0) + 1;
      }
      return;
    }
    const kind = unsupportedKind(entity);
    skipped[kind] = (skipped[kind] ?? 0) + 1;
  }

  if (!document.modelSpace)
    throw new Error("El archivo CAD no contiene espacio modelo.");
  for (const entity of document.modelSpace.entities) add(entity);
  return {
    shapes,
    layers: [...layers.values()]
      .filter((layer) => layer.count > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
    skipped,
  };
}

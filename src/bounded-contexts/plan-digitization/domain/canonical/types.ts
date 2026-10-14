/** Serializable architectural IR. Coordinates use metres, XY ground plane, Z up. */
export type Point2 = [number, number];
export type Point3 = [number, number, number];
export type DimensionSource =
  | "explicit_plan"
  | "section_cross_ref"
  | "schedule_table"
  | "inferred_fallback"
  | "manual_confirmation"
  | "unresolved";
export interface SourceReference {
  documentId: string;
  documentName?: string;
  viewId?: string;
  entityIds: string[];
}
export interface DimensionValue<T> {
  value: T | null;
  source: DimensionSource;
  /** Null until the relevant confidence estimator has been independently calibrated. */
  confidence: number | null;
  calibrationId?: string;
  status: "proposed" | "confirmed" | "conflicting" | "missing";
  evidence: SourceReference[];
}
export type Curve2D =
  | { kind: "line"; start: Point2; end: Point2 }
  | {
      kind: "arc";
      center: Point2;
      radius: number;
      startAngle: number;
      sweepAngle: number;
    }
  | { kind: "bezier"; controlPoints: [Point2, Point2, Point2, Point2] };
export interface Polygon2D {
  outer: Point2[];
  holes: Point2[][];
}
export interface CanonicalElement {
  id: string;
  levelId: string;
  evidence: SourceReference[];
  status: "proposed" | "confirmed";
}
export interface CanonicalWall extends CanonicalElement {
  kind: "wall";
  axis: Curve2D[];
  sections: Array<{
    position: number;
    thickness: DimensionValue<number>;
    height: DimensionValue<number>;
  }>;
}
export interface CanonicalOpening extends CanonicalElement {
  kind: "door" | "window";
  hostWallId: string;
  positionOnWall: number;
  center: Point2;
  width: DimensionValue<number>;
  height: DimensionValue<number>;
  sillHeight: DimensionValue<number>;
  family: DimensionValue<"hinged" | "sliding" | "double-leaf" | "fixed">;
}
export interface CanonicalSurface extends CanonicalElement {
  kind: "slab" | "roof";
  footprint: Polygon2D;
  thickness: DimensionValue<number>;
  elevation: DimensionValue<number>;
  slope: DimensionValue<Point2>;
}
export interface CanonicalColumn extends CanonicalElement {
  kind: "column";
  footprint: Polygon2D;
  height: DimensionValue<number>;
}
export interface CanonicalSpace extends CanonicalElement {
  kind: "space";
  name: DimensionValue<string>;
  boundaryFaceId: string | null;
  footprint: Polygon2D | null;
}
export interface CanonicalStair extends CanonicalElement {
  kind: "stair";
  configuration: DimensionValue<"straight" | "L" | "U" | "spiral" | "winder">;
  flights: Array<{
    path: Curve2D[];
    width: DimensionValue<number>;
    rise: DimensionValue<number>;
    stepCount: DimensionValue<number>;
  }>;
  landings: Array<{ footprint: Polygon2D; elevation: DimensionValue<number> }>;
  railings: Array<{ path: Point3[]; height: DimensionValue<number> }>;
}
export interface CanonicalFurniture extends CanonicalElement {
  kind: "furniture";
  category: string;
  catalogId: string | null;
  footprint: Polygon2D;
  height: DimensionValue<number>;
}
export interface CanonicalBeam extends CanonicalElement {
  kind: "beam";
  path: Point3[];
  section: DimensionValue<Polygon2D>;
}
export interface CanonicalFoundation extends CanonicalElement {
  kind: "foundation";
  family: DimensionValue<
    "isolated-footing" | "strip-footing" | "raft" | "pile"
  >;
  footprint: Polygon2D;
  depth: DimensionValue<number>;
}
export interface CanonicalNetwork extends CanonicalElement {
  kind: "mep-network";
  discipline: "electrical" | "water" | "drainage" | "hvac";
  nodes: Array<{
    id: string;
    planPosition: Point2;
    position: DimensionValue<Point3>;
    equipmentType: string;
  }>;
  segments: Array<{
    id: string;
    fromId: string;
    toId: string;
    route: DimensionValue<Point3[]>;
    section: DimensionValue<
      { diameter: number } | { width: number; height: number }
    >;
  }>;
}
export type ArchitecturalElement =
  | CanonicalWall
  | CanonicalOpening
  | CanonicalSurface
  | CanonicalColumn
  | CanonicalSpace
  | CanonicalStair
  | CanonicalFurniture
  | CanonicalBeam
  | CanonicalFoundation
  | CanonicalNetwork;
export interface PlanarTopology {
  nodes: Array<{ id: string; position: Point2 }>;
  halfEdges: Array<{
    id: string;
    origin: string;
    twin: string;
    next: string;
    previous: string;
    face: string;
    wallIds: string[];
  }>;
  faces: Array<{
    id: string;
    boundary: string;
    innerBoundaries: string[];
    polygon: Polygon2D;
    exterior: boolean;
  }>;
}
export interface CanonicalIssue {
  code: string;
  severity: "warning" | "blocking";
  elementIds: string[];
  message: string;
}
export interface CanonicalFloorPlanGraph {
  schemaVersion: "1.0";
  coordinateSystem: "right-handed-z-up-meters";
  sourceKind: "cad" | "raster" | "manual";
  unitsConfirmed: boolean;
  levels: Array<{
    id: string;
    name: string;
    elevation: DimensionValue<number>;
    topology: PlanarTopology;
  }>;
  elements: ArchitecturalElement[];
  issues: CanonicalIssue[];
  terrain?: {
    vertices: Point3[];
    triangles: [number, number, number][];
    platform: Polygon2D;
  };
}

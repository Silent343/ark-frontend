export interface Level {
  id: string;
  name: string;
  elevation: number;
}
export interface Room {
  id: string;
  levelId?: string;
  sheetId?: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
}
export interface Wall {
  id: string;
  levelId?: string;
  sheetId?: string;
  start: [number, number];
  end: [number, number];
  thickness: number;
  height: number;
}
export interface Opening {
  id: string;
  levelId?: string;
  sheetId?: string;
  wallId: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
  height?: number;
  sillHeight?: number;
}
export interface Column {
  id: string;
  levelId?: string;
  sheetId?: string;
  x: number;
  y: number;
  size: number;
}
export interface Stair {
  id: string;
  levelId?: string;
  sheetId?: string;
  x: number;
  y: number;
  radius: number;
  type: "spiral" | "straight";
  /** Straight-flight geometry; radius is its half-width for legacy editor controls. */
  length?: number;
  rotation?: number;
}
export type PlanDiscipline = "architecture" | "structure" | "electrical" | "plumbing";

/** A source page stays identifiable even when several drawings share a level. */
export interface PlanSheet {
  /** Coordinates are aligned to the shared project sheet. */
  id: string;
  name: string;
  discipline: PlanDiscipline;
  levelId: string;
  sourceName: string;
  page: number;
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
  metersPerUnit: number;
  /** Import evidence belongs to this page, not to whichever page was imported last. */
  evidence?: Pick<PlanReview, "method" | "warnings" | "text">;
}

/** Explicit roof coverage; an absent zone never creates a full-footprint roof. */
export interface RoofZone {
  id: string;
  levelId: string;
  sheetId?: string;
  name: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  thickness: number;
  elevation: number;
}

export type ServiceKind = "outlet" | "switch" | "light" | "panel" | "water" | "drain";
export interface ServicePoint {
  id: string;
  levelId: string;
  kind: ServiceKind;
  name: string;
  x: number;
  y: number;
  sheetId?: string;
}
/** User-confirmed logical connection; its direct 3D path is illustrative, not a MEP design. */
export interface ServiceRoute {
  id: string;
  levelId: string;
  sheetId?: string;
  kind: "electrical" | "plumbing";
  fromId: string;
  toId: string;
}
export interface SeismicParameters {
  defaultIntensity: number;
  defaultDuration: number;
  defaultDirection: string;
  maxDisplacement: number;
  maxDrift: number;
}

/** Review evidence is kept separate from geometry; heuristic scores are not probabilities. */
export interface PlanReview {
  sourceName: string;
  page: number;
  method: "local-lines-v1" | "manual-tracing";
  status: "draft" | "reviewed";
  reviewedIds: string[];
  warnings: string[];
  text: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
    source: "pdf" | "ocr";
  }>;
}

/** Shared, calibrated geometry consumed by both editors and the procedural renderer. */
export interface Blueprint {
  projectId: string;
  width: number;
  height: number;
  scale: string;
  /** Optional source plan aligned to the blueprint coordinate system. */
  sourceImage?: string;
  /** Keep the raster aligned when the editable sheet is enlarged. */
  sourceSize?: { width: number; height: number };
  /** Display offset for the active source sheet; never persisted as geometry. */
  sourceOffset?: { x: number; y: number };
  calibration?: {
    metersPerUnit: number;
    referencePoints: [[number, number], [number, number]];
    referenceDistanceM: number;
  };
  review?: PlanReview;
  /** Legacy geometry without a levelId belongs to the first level. */
  levels: Level[];
  sheets?: PlanSheet[];
  roofs?: RoofZone[];
  services?: ServicePoint[];
  routes?: ServiceRoute[];
  rooms: Room[];
  walls: Wall[];
  doors: Opening[];
  windows: Opening[];
  columns: Column[];
  stairs?: Stair[];
  materials: string[];
  seismic: SeismicParameters;
}

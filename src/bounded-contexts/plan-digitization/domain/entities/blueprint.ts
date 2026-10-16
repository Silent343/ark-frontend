import type { CadPlan } from "./cad-plan";

export interface Level {
  id: string;
  name: string;
  elevation: number;
  height?: number;
  heightSource?: "manual" | "levels" | "assumed";
}
export interface ElementEvidence {
  sourceName: string;
  regionId: string;
  sourceIds: string[];
  method:
    | "paired-faces"
    | "cad-symbol"
    | "closed-contour"
    | "treads"
    | "cad-text"
    | "neural-mask";
  /** Properties whose values are placeholders rather than measurements. */
  assumed: string[];
}
export interface Room {
  /** Source-supported non-rectangular space; bounds are editor handles only. */
  polygon?: Array<[number, number]>;
  holes?: Array<Array<[number, number]>>;
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
  depth?: number;
  rotation?: number;
  height?: number;
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
  rise?: number;
  baseElevation?: number;
  stepCount?: number;
}

/** Floor contours follow enclosed CAD faces; shafts and stair voids remain holes. */
export interface FloorSlab {
  sheetId?: string;
  id: string;
  levelId: string;
  name: string;
  polygon: Array<[number, number]>;
  holes: Array<Array<[number, number]>>;
  thickness: number;
}
export type PlanDiscipline =
  "architecture" | "structure" | "electrical" | "plumbing";

/** A source page stays identifiable even when several drawings share a level. */
export interface PlanSheet {
  sourceCalibration?: import("../plan-calibration").SourceCalibration;
  /** Full raster used for inference, distinct from the compressed display thumbnail. */
  analysisImage?: string;
  neural?: import("../raster-neural").RasterNeuralProposal;
  viewType?: import("../drawing-coordination").DrawingView;
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
  /** CAD coverage follows an explicit closed outline instead of its rectangular bounds. */
  polygon?: Array<[number, number]>;
}

export type ServiceKind =
  "outlet" | "switch" | "light" | "panel" | "water" | "drain";
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
  method: "local-lines-v1" | "manual-tracing" | "neural-image-v1";
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
    source: "pdf" | "ocr" | "cad";
  }>;
}

/** Shared, calibrated geometry consumed by both editors and the procedural renderer. */
export interface Blueprint {
  /** Manual representation choices survive rebuilding source CAD; they do not validate detections. */
  fixtureFamilies?: import("../fixture-families").FixtureFamilyAssignments;
  correspondences?: import("../drawing-coordination").DrawingCorrespondence[];
  intent?: "visualization" | "coordination" | "bim-preparation";
  elementEvidence?: Record<string, ElementEvidence>;
  cad?: CadPlan;
  slabs?: FloorSlab[];
  /** Original furniture symbols remain precise plan details rather than invented bounding-box solids. */
  floorDetails?: Array<{ levelId: string; segments: number[] }>;
  reconstruction?: {
    version: number;
    pairedWalls: number;
    sourceEdges: number;
    alignedPlans: number;
    namedSpaces: number;
    fixtureCount?: number;
    unresolvedSymbols?: number;
    inferredLayers?: string[];
    unmatchedOpenings?: number;
    unregisteredRegions?: string[];
  };
  fixtures?: Array<{
    sheetId?: string;
    id: string;
    levelId: string;
    x: number;
    y: number;
    width: number;
    depth: number;
    height: number;
    name: string;
    kind?: import("../cad-evidence").FixtureKind;
    rotation?: number;
    evidence?: "block" | "repeated-symbol" | "neural-mask" | "neural-box";
    sourceIds?: string[];
  }>;
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

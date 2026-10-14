/** CAD entities retain drawing coordinates and layers through editing and export. */
export type CadRole =
  | "reference"
  | "wall"
  | "door"
  | "window"
  | "column"
  | "stair"
  | "furniture"
  | "roof"
  | "electrical"
  | "plumbing";
interface CadEntityBase {
  id: string;
  layer: string;
  color: string;
  group?: string;
  /** Original block identity survives explosion; used as evidence, never as a mesh. */
  blockName?: string;
  role?: CadRole;
  /** Keeps automatic reclassification from overwriting an explicit entity mapping. */
  roleSource?: "geometry" | "name" | "manual";
}
export type CadEntity = CadEntityBase &
  (
    | { kind: "path"; points: number[]; closed: boolean }
    | { kind: "circle"; x: number; y: number; radius: number }
    | {
        kind: "text";
        x: number;
        y: number;
        height: number;
        rotation: number;
        value: string;
      }
  );
export interface CadLayer {
  name: string;
  visible: boolean;
  count: number;
  role: CadRole;
  inferred?: boolean;
  reviewed?: boolean;
}
export interface CadBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
/** A plan view is positioned independently from elevations and sections on the same CAD sheet. */
export interface CadRegion extends CadBounds {
  viewType?: import("../drawing-coordination").DrawingView;
  id: string;
  name: string;
  elevation: number;
  enabled: boolean;
  repeat: number;
  /** Explicit NPT heights found on repeated-floor drawings, when available. */
  elevations?: number[];
  elevationSource?: "annotation" | "manual";
  /** Confirmed wall height for this view, in metres; never a CAD coordinate. */
  wallHeight?: number;
  /** Manual translation into the reference plan, in metres. */
  /** Manual correction to automatic registration, in metres. */
  alignment?: { x: number; y: number };
}
export interface CadPlan {
  neural?: import("../neural-plan").CadNeuralAnalysis[];
  sourceName: string;
  entities: CadEntity[];
  layers: CadLayer[];
  bounds: CadBounds;
  metersPerCadUnit: number;
  unitConfirmed: boolean;
  regions: CadRegion[];
  skipped: Record<string, number>;
}

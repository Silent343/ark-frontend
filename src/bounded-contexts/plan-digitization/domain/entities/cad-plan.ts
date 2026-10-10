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
}
export interface CadBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
/** A plan view is positioned independently from elevations and sections on the same CAD sheet. */
export interface CadRegion extends CadBounds {
  id: string;
  name: string;
  elevation: number;
  enabled: boolean;
  repeat: number;
  /** Explicit NPT heights found on repeated-floor drawings, when available. */
  elevations?: number[];
}
export interface CadPlan {
  sourceName: string;
  entities: CadEntity[];
  layers: CadLayer[];
  bounds: CadBounds;
  metersPerCadUnit: number;
  unitConfirmed: boolean;
  regions: CadRegion[];
  skipped: Record<string, number>;
}

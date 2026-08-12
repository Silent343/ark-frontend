export interface Level { id: string; name: string; elevation: number; }
export interface Room { id: string; name: string; x: number; y: number; width: number; height: number; area: number; }
export interface Wall { id: string; start: [number, number]; end: [number, number]; thickness: number; height: number; }
export interface Opening { id: string; wallId: string; x: number; y: number; width: number; rotation: number; }
export interface Column { id: string; x: number; y: number; size: number; }
export interface Stair { id: string; x: number; y: number; radius: number; type: "spiral"; }
export interface SeismicParameters { defaultIntensity: number; defaultDuration: number; defaultDirection: string; maxDisplacement: number; maxDrift: number; }

/** Plan Digitization aggregate produced by the future detection pipeline. */
export interface Blueprint {
  projectId: string;
  width: number;
  height: number;
  scale: string;
  /** Optional source plan aligned to the blueprint coordinate system. */
  sourceImage?: string;
  levels: Level[];
  rooms: Room[];
  walls: Wall[];
  doors: Opening[];
  windows: Opening[];
  columns: Column[];
  stairs?: Stair[];
  materials: string[];
  seismic: SeismicParameters;
}

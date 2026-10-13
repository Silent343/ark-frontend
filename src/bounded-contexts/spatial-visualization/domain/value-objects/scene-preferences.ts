/** Material presets understood by the Spatial Visualization context. */
export type MaterialPreset = "Concrete" | "Brick" | "Wood" | "Glass";

/** Lighting environments understood by the Spatial Visualization context. */
export type LightingPreset = "Day" | "Sunset" | "Night";

/** Camera arrangements understood by the Spatial Visualization context. */
export type CameraPreset = "Isometric" | "Top" | "Walkthrough";

/** Semantic layer selected in the 3D studio. */
export type ModelViewMode = "Architecture" | "Structure";

/** Rectangular wall fragment ready for consumption by a 3D rendering adapter. */
export interface SceneWallSegment {
  id: string;
  elementId?: string;
  length: number;
  height: number;
  x: number;
  y: number;
  z: number;
  rotation: number;
  thickness: number;
}

/** Opening translated into scene coordinates for frames and leaves. */
export interface SceneOpening {
  id: string;
  type: "door" | "window";
  width: number;
  height: number;
  sillHeight: number;
  x: number;
  z: number;
  rotation: number;
}

/** Exact footprint and translated geometry consumed by the renderer. */
export interface SceneModel {
  centerX: number;
  centerY: number;
  scale: number;
  width: number;
  depth: number;
  wallSegments: SceneWallSegment[];
  openings: SceneOpening[];
}

/** Supported lifecycle states for a Teluria project. */
export type ProjectStatus = "Ready" | "Processing" | "Draft";

/** Visual variants used by the local thumbnail renderer. */
export type ProjectThumbnailVariant = "blueprint" | "tower" | "house";

/** Project Management aggregate root, independent from UI and persistence. */
export interface Project {
  id: string;
  name: string;
  location: string;
  updatedAt: string;
  structureType: string;
  status: ProjectStatus;
  floors: number;
  floorHeight: number;
  soilType: string;
  thumbnailVariant: ProjectThumbnailVariant;
  progress: number;
}

/** Input accepted by the create-project use case. */
export interface CreateProjectInput {
  name: string;
  location: string;
  floors: number;
  floorHeight: number;
  structureType: string;
  soilType: string;
}

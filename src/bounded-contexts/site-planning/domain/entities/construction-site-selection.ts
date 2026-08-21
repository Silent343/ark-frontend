/** Geographic lot and buildable footprint selected for an architectural project. */
export interface ConstructionSiteSelection {
  projectId: string;
  latitude: number;
  longitude: number;
  locationLabel: string;
  lotWidthM: number;
  lotDepthM: number;
  lotAreaM2: number;
  buildableAreaM2: number;
  updatedAt: string;
}

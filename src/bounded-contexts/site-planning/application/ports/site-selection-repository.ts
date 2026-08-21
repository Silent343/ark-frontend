import type { ConstructionSiteSelection } from "@/bounded-contexts/site-planning/domain/entities/construction-site-selection";

/** Persistence boundary for the selected project lot. */
export interface SiteSelectionRepository {
  findByProjectId(projectId: string): Promise<ConstructionSiteSelection | null>;
  save(selection: ConstructionSiteSelection): Promise<void>;
}

import type { SiteSelectionRepository } from "@/bounded-contexts/site-planning/application/ports/site-selection-repository";
import type { ConstructionSiteSelection } from "@/bounded-contexts/site-planning/domain/entities/construction-site-selection";

/** Loads the project lot without coupling presentation to browser storage. */
export class GetSiteSelection {
  constructor(private readonly repository: SiteSelectionRepository) {}
  execute(projectId: string) { return this.repository.findByProjectId(projectId); }
}

/** Stores a validated geographic lot selection. */
export class SaveSiteSelection {
  constructor(private readonly repository: SiteSelectionRepository) {}
  execute(selection: ConstructionSiteSelection) { return this.repository.save(selection); }
}

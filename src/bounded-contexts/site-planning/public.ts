import { GetSiteSelection, SaveSiteSelection } from "@/bounded-contexts/site-planning/application/use-cases/manage-site-selection";
import { LocalSiteSelectionRepository } from "@/bounded-contexts/site-planning/infrastructure/repositories/local-site-selection-repository";

const repository = new LocalSiteSelectionRepository();

/** Site-planning bounded-context public application API. */
export const sitePlanning = {
  getSelection: new GetSiteSelection(repository),
  saveSelection: new SaveSiteSelection(repository),
};

export type { ConstructionSiteSelection } from "@/bounded-contexts/site-planning/domain/entities/construction-site-selection";

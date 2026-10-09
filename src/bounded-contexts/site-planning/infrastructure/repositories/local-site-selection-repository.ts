import type { SiteSelectionRepository } from "@/bounded-contexts/site-planning/application/ports/site-selection-repository";
import type { ConstructionSiteSelection } from "@/bounded-contexts/site-planning/domain/entities/construction-site-selection";

const STORAGE_KEY = "ark:construction-sites";

/** Browser adapter used until a geographic persistence API is connected. */
export class LocalSiteSelectionRepository implements SiteSelectionRepository {
  async findByProjectId(projectId: string) {
    if (typeof window === "undefined") return null;
    const selections = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as ConstructionSiteSelection[];
    return selections.find((selection) => selection.projectId === projectId) ?? null;
  }

  async save(selection: ConstructionSiteSelection) {
    if (typeof window === "undefined") return;
    const selections = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as ConstructionSiteSelection[];
    const next = [...selections.filter((item) => item.projectId !== selection.projectId), selection];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}

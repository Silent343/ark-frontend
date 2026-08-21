import type { BlueprintRepository } from "@/bounded-contexts/plan-digitization/application/ports/blueprint-repository";
import type { Blueprint } from "@/bounded-contexts/plan-digitization/domain/entities/blueprint";

interface LocalPlanDatabase { blueprint: Blueprint; blueprints?: Blueprint[]; }

/** JSON adapter for the Plan Digitization prototype. */
export class JsonBlueprintRepository implements BlueprintRepository {
  private databasePromise: Promise<LocalPlanDatabase> | null = null;

  private getDatabase() {
    if (!this.databasePromise) {
      this.databasePromise = fetch("/db.json").then(async (response) => {
        if (!response.ok) throw new Error("The local blueprint database could not be loaded.");
        return (await response.json()) as LocalPlanDatabase;
      });
    }
    return this.databasePromise;
  }

  async findByProjectId(projectId: string): Promise<Blueprint> {
    const database = await this.getDatabase();
    const localBlueprint = this.readLocalBlueprint(projectId);
    if (localBlueprint) return localBlueprint;
    const matchedBlueprint = database.blueprints?.find((blueprint) => blueprint.projectId === projectId);
    if (matchedBlueprint) return matchedBlueprint;
    return { ...database.blueprint, projectId };
  }

  async save(blueprint: Blueprint): Promise<void> {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(this.storageKey(blueprint.projectId), JSON.stringify(blueprint));
  }

  private storageKey(projectId: string) {
    return `teluria.blueprint.v2.${projectId}`;
  }

  private readLocalBlueprint(projectId: string): Blueprint | null {
    if (typeof window === "undefined") return null;
    const serialized = window.localStorage.getItem(this.storageKey(projectId));
    if (!serialized) return null;
    try { return JSON.parse(serialized) as Blueprint; }
    catch { window.localStorage.removeItem(this.storageKey(projectId)); return null; }
  }
}

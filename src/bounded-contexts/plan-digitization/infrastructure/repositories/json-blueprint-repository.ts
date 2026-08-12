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
    const matchedBlueprint = database.blueprints?.find((blueprint) => blueprint.projectId === projectId);
    if (matchedBlueprint) return matchedBlueprint;
    return { ...database.blueprint, projectId };
  }
}

import type { BlueprintRepository } from "@/bounded-contexts/plan-digitization/application/ports/blueprint-repository";

/** Loads the semantic plan associated with a project identifier. */
export class GetBlueprint {
  constructor(private readonly repository: BlueprintRepository) {}

  execute(projectId: string) {
    return this.repository.findByProjectId(projectId);
  }
}

import type { Blueprint } from "@/bounded-contexts/plan-digitization/domain/entities/blueprint";

/** Persistence boundary owned by the Plan Digitization context. */
export interface BlueprintRepository {
  findByProjectId(projectId: string): Promise<Blueprint>;
  save(blueprint: Blueprint): Promise<void>;
}

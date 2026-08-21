import type { BlueprintRepository } from "@/bounded-contexts/plan-digitization/application/ports/blueprint-repository";
import type { Blueprint } from "@/bounded-contexts/plan-digitization/domain/entities/blueprint";

/** Persists a corrected semantic plan through the context repository boundary. */
export class SaveBlueprint {
  constructor(private readonly repository: BlueprintRepository) {}

  execute(blueprint: Blueprint) {
    return this.repository.save(blueprint);
  }
}

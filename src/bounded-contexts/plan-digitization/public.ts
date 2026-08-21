import { GetBlueprint } from "@/bounded-contexts/plan-digitization/application/use-cases/get-blueprint";
import { SaveBlueprint } from "@/bounded-contexts/plan-digitization/application/use-cases/save-blueprint";
import { JsonBlueprintRepository } from "@/bounded-contexts/plan-digitization/infrastructure/repositories/json-blueprint-repository";

const repository = new JsonBlueprintRepository();

/** Public application API exposed by the Plan Digitization bounded context. */
export const planDigitization = {
  getBlueprint: new GetBlueprint(repository),
  saveBlueprint: new SaveBlueprint(repository),
};

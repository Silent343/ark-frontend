import { HttpResourceRepository } from "@/shared/infrastructure/http-resource-repository";
import type { BudgetItem } from "../domain/budget-item";
/** HTTP adapter for the context-owned REST resource. */
export class HttpBudgetItemRepository extends HttpResourceRepository<BudgetItem> {
  constructor() {
    super("budget-items");
  }
}

import { ManageBudgetItems } from "./application/manage-budget-items";
import { HttpBudgetItemRepository } from "./infrastructure/http-repository";
/** Public use cases; consumers never reach into context internals. */
export const budgetItems = new ManageBudgetItems(
  new HttpBudgetItemRepository(),
);

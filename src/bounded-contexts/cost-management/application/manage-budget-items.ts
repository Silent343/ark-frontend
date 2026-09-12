import { ManageResources } from "@/kernel/application/manage-resources";
import type { BudgetItem } from "../domain/budget-item";
/** Application entry point for the cost-management bounded context. */
export class ManageBudgetItems extends ManageResources<BudgetItem> {}

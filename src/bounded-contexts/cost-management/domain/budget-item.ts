import {
  required,
  amount,
  type Resource,
  type ResourceRules,
} from "@/kernel/domain/resource";
/** BudgetItem aggregate owned exclusively by cost-management. Wire and storage names are explicit. */
export interface BudgetItem extends Resource {
  supplier?: string;
  stage?: string;
  title: string;
  category: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  actual_cost: number;
}
/** Invariants are enforced on the complete candidate, including PATCH operations. */
export const BudgetItemRules: ResourceRules = {
  fields: [
    "title",
    "category",
    "quantity",
    "unit",
    "unit_cost",
    "actual_cost",
    "supplier",
    "stage",
  ],
  validate(v) {
    required(v.title, "title");
    required(v.category, "category");
    required(v.unit, "unit");
    amount(v.quantity, "quantity");
    amount(v.unit_cost, "unit_cost");
    amount(v.actual_cost, "actual_cost");
  },
};

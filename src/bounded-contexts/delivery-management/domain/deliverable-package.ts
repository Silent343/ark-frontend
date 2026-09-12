import {
  required,
  choice,
  date,
  ValidationError,
  type Resource,
  type ResourceRules,
} from "@/kernel/domain/resource";
/** DeliverablePackage belongs to its project and exposes stable references across contexts. */
export interface DeliverablePackage extends Resource {
  title: string;
  stage: string;
  due_date: string;
  status: string;
  document_ids: string[];
}
export const DeliverablePackageRules: ResourceRules = {
  fields: ["title", "stage", "due_date", "status", "document_ids"],
  validate(v) {
    required(v.title, "title");
    date(v.due_date, "due_date");
    choice(
      v.stage,
      ["proposal", "design", "review", "construction", "delivered"],
      "stage",
    );
    choice(v.status, ["draft", "in_review", "approved"], "status");
    if (
      !Array.isArray(v.document_ids) ||
      !v.document_ids.every((id) => typeof id === "string")
    )
      throw new ValidationError("Select document versions.");
  },
};

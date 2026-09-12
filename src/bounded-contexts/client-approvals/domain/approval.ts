import {
  required,
  choice,
  type Resource,
  type ResourceRules,
} from "@/kernel/domain/resource";
/** Approval aggregate owned exclusively by client-approvals. Wire and storage names are explicit. */
export interface Approval extends Resource {
  reviewer_id?: string;
  title: string;
  description: string;
  document_id: string;
  status: "pending" | "approved" | "changes_requested";
  reviewer: string;
  feedback: string;
  decided_at: string;
}
/** Invariants are enforced on the complete candidate, including PATCH operations. */
export const ApprovalRules: ResourceRules = {
  fields: [
    "reviewer_id",
    "title",
    "description",
    "document_id",
    "status",
    "reviewer",
    "feedback",
    "decided_at",
  ],
  validate(v) {
    required(v.title, "title");
    required(v.reviewer, "reviewer");
    choice(v.status, ["pending", "approved", "changes_requested"], "status");
    if (v.status !== "pending") required(v.feedback, "feedback", 2000);
  },
};

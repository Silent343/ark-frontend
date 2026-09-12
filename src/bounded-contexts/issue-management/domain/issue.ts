import {
  required,
  date,
  choice,
  type Resource,
  type ResourceRules,
} from "@/kernel/domain/resource";
/** Issue aggregate owned exclusively by issue-management. Wire and storage names are explicit. */
export interface Issue extends Resource {
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved";
  priority: "low" | "medium" | "high";
  assignee: string;
  due_date: string;
  element_id: string;
}
/** Invariants are enforced on the complete candidate, including PATCH operations. */
export const IssueRules: ResourceRules = {
  fields: [
    "title",
    "description",
    "status",
    "priority",
    "assignee",
    "due_date",
    "element_id",
  ],
  validate(v) {
    required(v.title, "title");
    required(v.assignee, "assignee");
    date(v.due_date, "due_date");
    choice(v.status, ["open", "in_progress", "resolved"], "status");
    choice(v.priority, ["low", "medium", "high"], "priority");
  },
};

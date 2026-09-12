import {
  required,
  date,
  choice,
  ValidationError,
  type Resource,
  type ResourceRules,
} from "@/kernel/domain/resource";
/** Milestone aggregate owned exclusively by project-planning. Wire and storage names are explicit. */
export interface Milestone extends Resource {
  title: string;
  start_date: string;
  due_date: string;
  status: "planned" | "in_progress" | "completed";
  owner: string;
}
/** Invariants are enforced on the complete candidate, including PATCH operations. */
export const MilestoneRules: ResourceRules = {
  fields: ["title", "start_date", "due_date", "status", "owner"],
  validate(v) {
    required(v.title, "title");
    required(v.owner, "owner");
    date(v.start_date, "start_date");
    date(v.due_date, "due_date");
    if (String(v.due_date) < String(v.start_date))
      throw new ValidationError("due_date: must follow start_date.");
    choice(v.status, ["planned", "in_progress", "completed"], "status");
  },
};

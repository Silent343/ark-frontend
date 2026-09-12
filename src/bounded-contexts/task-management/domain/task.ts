import {
  required,
  date,
  choice,
  ValidationError,
  type Resource,
  type ResourceRules,
} from "@/kernel/domain/resource";
/** Task aggregate owned exclusively by task-management. Wire and storage names are explicit. */
export interface Task extends Resource {
  title: string;
  description: string;
  status: "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high";
  assignee: string;
  due_date: string;
  discipline: string;
  start_date?: string;
  assignee_id?: string;
}
/** Invariants are enforced on the complete candidate, including PATCH operations. */
export const TaskRules: ResourceRules = {
  fields: [
    "title",
    "description",
    "status",
    "priority",
    "assignee",
    "due_date",
    "discipline",
    "start_date",
    "assignee_id",
  ],
  validate(v) {
    required(v.title, "title");
    required(v.assignee, "assignee");
    required(v.discipline, "discipline");
    date(v.due_date, "due_date");
    if(v.start_date){date(v.start_date,"start_date");if(String(v.start_date)>String(v.due_date))throw new ValidationError("Start date must be before the due date.");}
    choice(v.status, ["todo", "in_progress", "review", "done"], "status");
    choice(v.priority, ["low", "medium", "high"], "priority");
  },
};

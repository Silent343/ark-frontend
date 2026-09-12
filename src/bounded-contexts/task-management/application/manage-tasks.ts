import { ManageResources } from "@/kernel/application/manage-resources";
import type { Task } from "../domain/task";
/** Application entry point for the task-management bounded context. */
export class ManageTasks extends ManageResources<Task> {}

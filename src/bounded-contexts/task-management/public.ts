import { ManageTasks } from "./application/manage-tasks";
import { HttpTaskRepository } from "./infrastructure/http-repository";
/** Public use cases; consumers never reach into context internals. */
export const tasks = new ManageTasks(new HttpTaskRepository());

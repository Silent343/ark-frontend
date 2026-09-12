import { HttpResourceRepository } from "@/shared/infrastructure/http-resource-repository";
import type { Task } from "../domain/task";
/** HTTP adapter for the context-owned REST resource. */
export class HttpTaskRepository extends HttpResourceRepository<Task> {
  constructor() {
    super("tasks");
  }
}

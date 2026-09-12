import { HttpResourceRepository } from "@/shared/infrastructure/http-resource-repository";
import type { Milestone } from "../domain/milestone";
/** HTTP adapter for the context-owned REST resource. */
export class HttpMilestoneRepository extends HttpResourceRepository<Milestone> {
  constructor() {
    super("milestones");
  }
}

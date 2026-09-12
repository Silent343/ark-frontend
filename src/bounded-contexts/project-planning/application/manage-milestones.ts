import { ManageResources } from "@/kernel/application/manage-resources";
import type { Milestone } from "../domain/milestone";
/** Application entry point for the project-planning bounded context. */
export class ManageMilestones extends ManageResources<Milestone> {}

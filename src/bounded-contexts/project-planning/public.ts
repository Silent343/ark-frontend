import { ManageMilestones } from "./application/manage-milestones";
import { HttpMilestoneRepository } from "./infrastructure/http-repository";
/** Public use cases; consumers never reach into context internals. */
export const milestones = new ManageMilestones(new HttpMilestoneRepository());

import { ManageIssues } from "./application/manage-issues";
import { HttpIssueRepository } from "./infrastructure/http-repository";
/** Public use cases; consumers never reach into context internals. */
export const issues = new ManageIssues(new HttpIssueRepository());

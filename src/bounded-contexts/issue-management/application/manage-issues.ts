import { ManageResources } from "@/kernel/application/manage-resources";
import type { Issue } from "../domain/issue";
/** Application entry point for the issue-management bounded context. */
export class ManageIssues extends ManageResources<Issue> {}

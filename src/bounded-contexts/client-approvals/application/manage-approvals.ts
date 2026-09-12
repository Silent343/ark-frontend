import { ManageResources } from "@/kernel/application/manage-resources";
import type { Approval } from "../domain/approval";
/** Application entry point for the client-approvals bounded context. */
export class ManageApprovals extends ManageResources<Approval> {}

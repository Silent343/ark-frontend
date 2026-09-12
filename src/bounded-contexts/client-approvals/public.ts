import { ManageApprovals } from "./application/manage-approvals";
import { HttpApprovalRepository } from "./infrastructure/http-repository";
/** Public use cases; consumers never reach into context internals. */
export const approvals = new ManageApprovals(new HttpApprovalRepository());

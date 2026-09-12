import { HttpResourceRepository } from "@/shared/infrastructure/http-resource-repository";
import type { Approval } from "../domain/approval";
/** HTTP adapter for the context-owned REST resource. */
export class HttpApprovalRepository extends HttpResourceRepository<Approval> {
  constructor() {
    super("approvals");
  }
}

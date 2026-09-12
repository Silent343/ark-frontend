import { HttpResourceRepository } from "@/shared/infrastructure/http-resource-repository";
import type { Issue } from "../domain/issue";
/** HTTP adapter for the context-owned REST resource. */
export class HttpIssueRepository extends HttpResourceRepository<Issue> {
  constructor() {
    super("issues");
  }
}

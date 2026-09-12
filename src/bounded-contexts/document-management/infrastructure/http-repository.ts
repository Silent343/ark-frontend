import { HttpResourceRepository } from "@/shared/infrastructure/http-resource-repository";
import type { ProjectDocument } from "../domain/project-document";
/** HTTP adapter for the context-owned REST resource. */
export class HttpProjectDocumentRepository extends HttpResourceRepository<ProjectDocument> {
  constructor() {
    super("documents");
  }
}

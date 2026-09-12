import { ManageResources } from "@/kernel/application/manage-resources";
import type { ProjectDocument } from "../domain/project-document";
/** Application entry point for the document-management bounded context. */
export class ManageProjectDocuments extends ManageResources<ProjectDocument> {}

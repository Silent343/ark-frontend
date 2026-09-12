import { ManageProjectDocuments } from "./application/manage-documents";
import { HttpProjectDocumentRepository } from "./infrastructure/http-repository";
/** Public use cases; consumers never reach into context internals. */
export const documents = new ManageProjectDocuments(
  new HttpProjectDocumentRepository(),
);

import {
  required,
  amount,
  choice,
  ValidationError,
  type Resource,
  type ResourceRules,
} from "@/kernel/domain/resource";
/** ProjectDocument aggregate owned exclusively by document-management. Wire and storage names are explicit. */
export interface ProjectDocument extends Resource {
  title: string;
  discipline: string;
  version: number;
  status: "draft" | "in_review" | "approved" | "changes_requested";
  file_name: string;
  file_data: string;
  mime_type: string;
  notes: string;
  previous_version_id: string;
}
/** Invariants are enforced on the complete candidate, including PATCH operations. */
export const ProjectDocumentRules: ResourceRules = {
  fields: [
    "title",
    "discipline",
    "version",
    "status",
    "file_name",
    "file_data",
    "mime_type",
    "notes",
    "previous_version_id",
  ],
  validate(v) {
    required(v.title, "title");
    required(v.discipline, "discipline");
    amount(v.version, "version", 1);
    if (!Number.isInteger(v.version))
      throw new ValidationError("version: use an integer.");
    choice(
      v.status,
      ["draft", "in_review", "approved", "changes_requested"],
      "status",
    );
    required(v.file_name, "file_name");
    required(v.mime_type, "mime_type");
    if (
      typeof v.file_data !== "string" ||
      v.file_data.length > 4_200_000 ||
      (v.file_data &&
        !/^data:(application\/pdf|image\/(png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/.test(
          v.file_data,
        ))
    )
      throw new ValidationError(
        "file_data: PDF, PNG, JPEG or WebP, maximum 3 MB.",
      );
  },
};

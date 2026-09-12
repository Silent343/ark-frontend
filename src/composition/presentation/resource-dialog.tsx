"use client";
import { useState, type FormEvent } from "react";
import { Dialog, Field } from "./workspace-ui";
import { useWorkspace, workspaceServices } from "./workspace-context";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import type { ManageResources } from "@/kernel/application/manage-resources";
import type { Resource } from "@/kernel/domain/resource";
export type ResourceKey = keyof typeof workspaceServices;
type EditableRecord = Resource & Record<string, unknown>;
type InputField = {
  key: string;
  type?: string;
  options?: string[];
  required?: boolean;
};
export const fields: Record<ResourceKey, InputField[]> = {
  tasks: [
    { key: "title", required: true },
    { key: "description", type: "textarea" },
    { key: "assignee_id", type: "member" },
    { key: "start_date", type: "date", required: true },
    {
      key: "discipline",
      options: ["architecture", "structures", "installations", "interiors"],
    },
    { key: "due_date", type: "date", required: true },
    { key: "priority", options: ["low", "medium", "high"] },
    { key: "status", options: ["todo", "in_progress", "review", "done"] },
  ],
  milestones: [
    { key: "title", required: true },
    { key: "owner", required: true },
    { key: "start_date", type: "date", required: true },
    { key: "due_date", type: "date", required: true },
    { key: "status", options: ["planned", "in_progress", "completed"] },
  ],
  documents: [
    { key: "title", required: true },
    {
      key: "discipline",
      options: ["architecture", "structures", "installations", "interiors"],
    },
    {
      key: "status",
      options: ["draft", "in_review", "approved", "changes_requested"],
    },
    { key: "notes", type: "textarea" },
  ],
  issues: [
    { key: "title", required: true },
    { key: "description", type: "textarea" },
    { key: "element_id" },
    { key: "assignee", required: true },
    { key: "due_date", type: "date", required: true },
    { key: "priority", options: ["low", "medium", "high"] },
    { key: "status", options: ["open", "in_progress", "resolved"] },
  ],
  budgetItems: [
    { key: "title", required: true },
    {
      key: "category",
      options: [
        "design",
        "structure",
        "finishes",
        "openings",
        "installations",
        "other",
      ],
    },
    { key: "quantity", type: "number", required: true },
    { key: "unit", options: ["m²", "m", "m³", "unit", "global"] },
    { key: "unit_cost", type: "number", required: true },
    { key: "actual_cost", type: "number", required: true },
    { key: "supplier" },
    {
      key: "stage",
      options: ["proposal", "design", "review", "construction", "delivered"],
    },
  ],
  approvals: [
    { key: "title", required: true },
    { key: "description", type: "textarea" },
    { key: "reviewer_id", type: "member", required: true },
    { key: "document_id", type: "document" },
  ],
};
function defaults(resource: ResourceKey) {
  const today = new Date().toISOString().slice(0, 10);
  return Object.fromEntries(
    fields[resource].map((f) => [
      f.key,
      f.options?.[0] ??
        (f.type === "date" ? today : f.type === "number" ? 0 : ""),
    ]),
  );
}
/** Runtime schema is validated by the owning domain on the REST boundary. */
export function resourceService(resource: ResourceKey) {
  return workspaceServices[
    resource
  ] as unknown as ManageResources<EditableRecord>;
}
/** Compact resource editor shared by context-specific screens, with explicit save and failure feedback. */
export function ResourceDialog({
  resource,
  item,
  initial,
  onClose,
}: {
  resource: ResourceKey;
  item?: Resource;
  initial?: Record<string, unknown>;
  onClose: () => void;
}) {
  const { data, mutate, busy, error } = useWorkspace();
  const { t } = useI18n();
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({
    ...defaults(resource),
    ...initial,
    ...item,
  }));
  const [localError, setLocalError] = useState("");
  const [readingFile, setReadingFile] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const fileChanged = async (file?: File) => {
    if (!file) return;
    if (
      file.size > 3 * 1024 * 1024 ||
      !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
        file.type,
      )
    ) {
      setLocalError(t("pm.fileError"));
      return;
    }
    setLocalError("");
    setReadingFile(true);
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setDraft((d) => ({
        ...d,
        file_name: file.name,
        file_data: content,
        mime_type: file.type,
        title: d.title || file.name,
      }));
    } catch {
      setLocalError(t("pm.fileError"));
    } finally {
      setReadingFile(false);
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!data || readingFile) return;
    setLocalError("");
    const input: Record<string, unknown> = Object.fromEntries(
      fields[resource].map((f) => [f.key, draft[f.key]]),
    );
    if (resource === "tasks" || resource === "approvals") {
      const key = resource === "tasks" ? "assignee" : "reviewer";
      input[key] =
        data.coordination.members.find((m) => m.user_id === input[key + "_id"])
          ?.name ?? t("c.unassigned");
    }
    if (resource === "documents") {
      for (const key of [
        "version",
        "previous_version_id",
        "file_name",
        "file_data",
        "mime_type",
      ])
        input[key] = draft[key] ?? (key === "version" ? 1 : "");
      if (!item && !input.file_data) {
        setLocalError(t("pm.fileRequired"));
        return;
      }
    }
    if (resource === "approvals")
      Object.assign(input, { status: "pending", feedback: "", decided_at: "" });
    const service = resourceService(resource);
    if (
      await mutate(() =>
        item
          ? service.update(data.project.id, item as EditableRecord, input)
          : service.create(data.project.id, input),
      )
    )
      onClose();
  };
  return (
    <Dialog
      title={t(item ? "pm.edit" : "pm.add") + " · " + t("pm." + resource)}
      onClose={onClose}
    >
      <form onSubmit={save} className="pm-form">
        {(localError || error) && (
          <p className="pm-alert pm-danger" role="alert">
            {localError || error}
          </p>
        )}
        <div className="pm-form-grid">
          {fields[resource].map((f) => (
            <Field
              key={f.key}
              label={t(
                ["assignee_id", "reviewer_id", "supplier", "stage"].includes(
                  f.key,
                )
                  ? "c." +
                      {
                        assignee_id: "assignedMember",
                        reviewer_id: "assignedReviewer",
                        supplier: "supplier",
                        stage: "stage",
                      }[f.key]
                  : "pm.field." + f.key,
              )}
            >
              {f.options ? (
                <select
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) => update(f.key, e.target.value)}
                >
                  {f.options.map((v) => (
                    <option key={v} value={v}>
                      {t("pm.status." + v, v)}
                    </option>
                  ))}
                </select>
              ) : f.type === "member" ? (
                <select
                  required={f.required}
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) => update(f.key, e.target.value)}
                >
                  <option value="">{t("c.unassigned")}</option>
                  {data?.coordination.members
                    .filter(
                      (m) => resource === "approvals" || m.role !== "client",
                    )
                    .map((m) => (
                      <option key={m.id} value={m.user_id}>
                        {m.name} · {t("c." + m.role)}
                      </option>
                    ))}
                </select>
              ) : f.type === "document" ? (
                <select
                  value={String(draft.document_id ?? "")}
                  onChange={(e) => update("document_id", e.target.value)}
                >
                  <option value="">{t("pm.generalReview")}</option>
                  {data?.documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} · v{d.version}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  maxLength={2000}
                  rows={3}
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) => update(f.key, e.target.value)}
                />
              ) : (
                <input
                  type={f.type ?? "text"}
                  required={f.required}
                  min={f.type === "number" ? 0 : undefined}
                  step={f.type === "number" ? "0.01" : undefined}
                  maxLength={200}
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) =>
                    update(
                      f.key,
                      f.type === "number"
                        ? e.target.value === ""
                          ? ""
                          : Number(e.target.value)
                        : e.target.value,
                    )
                  }
                />
              )}
            </Field>
          ))}
        </div>
        {resource === "documents" && !item && (
          <Field label={t("pm.upload")}>
            <input
              type="file"
              disabled={readingFile || busy}
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => void fileChanged(e.target.files?.[0])}
            />
            <small>
              {t("pm.fileHelp")} · v{String(draft.version ?? 1)}
            </small>
          </Field>
        )}
        {resource === "issues" && (
          <p className="pm-muted">{t("pm.elementHelp")}</p>
        )}
        <div className="pm-dialog-actions">
          {item && data?.project.role !== "collaborator" && (
            <button
              type="button"
              className="pm-button pm-button-danger"
              disabled={busy}
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                if (
                  await mutate(() =>
                    resourceService(resource).delete(
                      data!.project.id,
                      item as EditableRecord,
                    ),
                  )
                )
                  onClose();
              }}
            >
              {t(confirmDelete ? "pm.confirmDelete" : "pm.delete")}
            </button>
          )}
          <button type="button" className="pm-button" onClick={onClose}>
            {t("pm.cancel")}
          </button>
          <button
            type="submit"
            className="pm-button pm-primary"
            disabled={busy || readingFile}
          >
            {t(busy ? "pm.saving" : "pm.save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { useWorkspace } from "./workspace-context";
import { Dialog } from "./workspace-ui";
import { requestJson } from "@/shared/infrastructure/rest-client";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import type { Resource } from "@/kernel/domain/resource";
export function useProjectActions() {
  const { data, mutate } = useWorkspace();
  return {
    save: (resource: string, input: object, item?: Resource) =>
      mutate(() =>
        requestJson(
          "/api/v1/projects/" +
            data!.project.id +
            "/" +
            resource +
            (item ? "/" + item.id : ""),
          {
            method: item ? "PATCH" : "POST",
            headers: item
              ? { "If-Match": JSON.stringify(item.updated_at) }
              : {},
            body: JSON.stringify(input),
          },
        ),
      ),
    remove: (resource: string, item: Resource) =>
      mutate(() =>
        requestJson(
          "/api/v1/projects/" +
            data!.project.id +
            "/" +
            resource +
            "/" +
            item.id,
          {
            method: "DELETE",
            headers: { "If-Match": JSON.stringify(item.updated_at) },
          },
        ),
      ),
  };
}
/** Form errors remain inside the modal; cancellation never sends a mutation. */
export function CoordinationForm({
  title,
  children,
  onClose,
  onSubmit,
  onDelete,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: (values: Record<string, FormDataEntryValue>) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
}) {
  const { busy, error } = useWorkspace(),
    { t } = useI18n();
  const [confirm, setConfirm] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (await onSubmit(Object.fromEntries(new FormData(e.currentTarget))))
      onClose();
  };
  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={submit} className="pm-form">
        {error && (
          <p role="alert" className="pm-alert pm-danger">
            {error}
          </p>
        )}
        {children}
        <div className="pm-dialog-actions">
          {onDelete && (
            <button
              type="button"
              className="pm-button pm-button-danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm) {
                  setConfirm(true);
                  return;
                }
                if (await onDelete()) onClose();
              }}
            >
              {t(confirm ? "pm.confirmDelete" : "pm.delete")}
            </button>
          )}
          <button type="button" className="pm-button" onClick={onClose}>
            {t("pm.cancel")}
          </button>
          <button disabled={busy} className="pm-button pm-primary">
            {t("pm.save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function CoordinationHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="pm-page-heading">
      <div>
        <p className="pm-eyebrow">TELURIA · COLLABORATION</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="pm-actions">{actions}</div>
    </header>
  );
}

"use client";
import { useState } from "react";
import { Plus, PackageOpen } from "lucide-react";
import Link from "next/link";
import type { DeliverablePackage } from "../index";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import {
  CoordinationHeading,
  CoordinationForm,
  useProjectActions,
} from "@/composition/presentation/coordination-ui";
import {
  Field,
  Empty,
  Status,
  dateLabel,
} from "@/composition/presentation/workspace-ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import { canManage } from "@/bounded-contexts/identity-access";
/** Delivery packages reference immutable document versions, so subsequent uploads do not alter an issued set. */
export function DeliverablesScreen() {
  const { data } = useWorkspace(),
    { t, locale } = useI18n(),
    actions = useProjectActions();
  const [editing, setEditing] = useState<
      DeliverablePackage | null | undefined
    >(),
    [documents, setDocuments] = useState<string[]>([]);
  if (!data) return null;
  const manage = canManage(data.project.role);
  return (
    <div>
      <CoordinationHeading
        title={t("c.deliverables")}
        description={t("c.deliverablesHelp")}
        actions={
          manage && (
            <button
              className="pm-button pm-primary"
              onClick={() => {
                setEditing(null);
                setDocuments([]);
              }}
            >
              <Plus size={16} />
              {t("c.newPackage")}
            </button>
          )
        }
      />
      {!data.coordination.packages.length ? (
        <Empty
          title={t("c.noPackages")}
          description={t("c.deliverablesHelp")}
        />
      ) : (
        <div className="collab-team-grid">
          {data.coordination.packages.map((pack) => (
            <article key={pack.id} className="pm-card collab-package">
              <div className="pm-row">
                <PackageOpen size={24} />
                <Status value={pack.status} />
              </div>
              <h2>{pack.title}</h2>
              <p>
                {t("pm.status." + pack.stage)} ·{" "}
                {dateLabel(pack.due_date, locale)}
              </p>
              <div className="collab-package-files">
                {pack.document_ids.map((id) => {
                  const doc = data.documents.find((d) => d.id === id);
                  return (
                    <Link
                      key={id}
                      href={"/projects/" + data.project.id + "/documents"}
                    >
                      {doc?.title ?? id} · v{doc?.version}
                    </Link>
                  );
                })}
              </div>
              {manage && (
                <button
                  className="pm-button pm-small"
                  onClick={() => {
                    setEditing(pack);
                    setDocuments(pack.document_ids);
                  }}
                >
                  {t("pm.edit")}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {editing !== undefined && (
        <CoordinationForm
          title={t(editing ? "pm.edit" : "c.newPackage")}
          onClose={() => setEditing(undefined)}
          onDelete={
            editing
              ? () => actions.remove("deliverable-packages", editing)
              : undefined
          }
          onSubmit={(v) =>
            actions.save(
              "deliverable-packages",
              { ...v, document_ids: documents },
              editing ?? undefined,
            )
          }
        >
          <Field label={t("pm.field.title")}>
            <input name="title" required defaultValue={editing?.title} />
          </Field>
          <div className="pm-form-grid">
            <Field label={t("c.stage")}>
              <select
                name="stage"
                defaultValue={editing?.stage ?? data.project.phase}
              >
                {[
                  "proposal",
                  "design",
                  "review",
                  "construction",
                  "delivered",
                ].map((s) => (
                  <option key={s} value={s}>
                    {t("pm.status." + s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("pm.field.due_date")}>
              <input
                type="date"
                name="due_date"
                required
                defaultValue={editing?.due_date}
              />
            </Field>
          </div>
          <Field label={t("pm.field.status")}>
            <select name="status" defaultValue={editing?.status ?? "draft"}>
              {["draft", "in_review", "approved"].map((s) => (
                <option key={s} value={s}>
                  {t("pm.status." + s)}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="collab-document-checks">
            <legend>{t("c.selectVersions")}</legend>
            {data.documents.map((doc) => (
              <label key={doc.id}>
                <input
                  type="checkbox"
                  checked={documents.includes(doc.id)}
                  onChange={(e) =>
                    setDocuments((list) =>
                      e.target.checked
                        ? [...list, doc.id]
                        : list.filter((id) => id !== doc.id),
                    )
                  }
                />
                <span>
                  {doc.title} · v{doc.version}
                </span>
                <Status value={doc.status} />
              </label>
            ))}
          </fieldset>
          <p className="pm-muted">{t("c.packageSharing")}</p>
        </CoordinationForm>
      )}
    </div>
  );
}

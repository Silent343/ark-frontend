"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Plus, ExternalLink } from "lucide-react";
import type { Issue } from "../index";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import { ResourceDialog } from "@/composition/presentation/resource-dialog";
import {
  Status,
  Empty,
  dateLabel,
} from "@/composition/presentation/workspace-ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
/** Element ids link observations to the source geometry rather than duplicating blueprint state. */
export function IssuesScreen() {
  const { data } = useWorkspace();
  const params = useSearchParams();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<Issue | null | undefined>(() =>
    params.get("element_id") ? null : undefined,
  );
  const [filter, setFilter] = useState("");
  if (!data) return null;
  const rows = data.issues.filter((i) => !filter || i.status === filter);
  return (
    <div>
      <header className="pm-page-heading">
        <div>
          <p className="pm-eyebrow">{t("pm.coordination")}</p>
          <h1>{t("pm.issues")}</h1>
          <p>{t("pm.issuesHelp")}</p>
        </div>
        <button
          className="pm-button pm-primary"
          onClick={() => setEditing(null)}
        >
          <Plus size={16} />
          {t("pm.newIssue")}
        </button>
      </header>
      <div className="pm-toolbar">
        <select
          aria-label={t("pm.field.status")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">{t("pm.allStatuses")}</option>
          {["open", "in_progress", "resolved"].map((v) => (
            <option key={v} value={v}>
              {t("pm.status." + v)}
            </option>
          ))}
        </select>
      </div>
      {!rows.length ? (
        <Empty title={t("pm.noIssues")} description={t("pm.issuesHelp")} />
      ) : (
        <div className="pm-card pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                {[
                  "title",
                  "assignee",
                  "due_date",
                  "priority",
                  "status",
                  "element_id",
                ].map((k) => (
                  <th key={k}>{t("pm.field." + k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      className="pm-text-button"
                      onClick={() => setEditing(row)}
                    >
                      {row.title}
                    </button>
                    <small>{row.description}</small>
                  </td>
                  <td>{row.assignee}</td>
                  <td>{dateLabel(row.due_date, locale)}</td>
                  <td>
                    <Status value={row.priority} />
                  </td>
                  <td>
                    <Status value={row.status} />
                  </td>
                  <td>
                    {row.element_id ? (
                      <Link
                        className="pm-inline-link"
                        href={
                          "/projects/" +
                          data.project.id +
                          "/editor?element_id=" +
                          encodeURIComponent(row.element_id)
                        }
                      >
                        {row.element_id}
                        <ExternalLink size={13} />
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing !== undefined && (
        <ResourceDialog
          resource="issues"
          item={editing ?? undefined}
          initial={{ element_id: params.get("element_id") ?? "" }}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

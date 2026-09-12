"use client";
import { useState } from "react";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import { CoordinationHeading } from "@/composition/presentation/coordination-ui";
import { Empty } from "@/composition/presentation/workspace-ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
/** Read-only journal exposes actor attribution and before/after business values. */
export function HistoryScreen() {
  const { data } = useWorkspace(),
    { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  if (!data) return null;
  const rows = data.coordination.changes.filter((c) =>
    (c.title + " " + (c.actor_name ?? ""))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div>
      <CoordinationHeading
        title={t("c.history")}
        description={t("c.historyHelp")}
      />
      <div className="pm-toolbar">
        <input
          aria-label={t("pm.search")}
          placeholder={t("c.searchHistory")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!rows.length ? (
        <Empty title={t("c.noChanges")} description={t("c.historyHelp")} />
      ) : (
        <div className="pm-card collab-section">
          {rows.map((change) => (
            <details className="collab-change" key={change.id}>
              <summary>
                <span className="collab-change-dot" />
                <span>
                  <strong>{change.title}</strong>
                  <small>
                    {change.actor_name ?? t("c.legacy")} ·{" "}
                    {t("c.action." + change.action, change.action)} ·{" "}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(change.created_at))}
                  </small>
                </span>
                <span className="pm-status">
                  {change.resource ?? "project"}
                </span>
              </summary>
              <div className="pm-table-wrap">
                <table className="pm-table">
                  <thead>
                    <tr>
                      <th>{t("c.field")}</th>
                      <th>{t("c.before")}</th>
                      <th>{t("c.after")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(change.changes ?? {}).map(
                      ([key, value]) => (
                        <tr key={key}>
                          <td>{key}</td>
                          <td>
                            <code>{JSON.stringify(value.before)}</code>
                          </td>
                          <td>
                            <code>{JSON.stringify(value.after)}</code>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

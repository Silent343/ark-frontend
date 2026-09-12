"use client";
import { useState } from "react";
import { Download, AlertTriangle } from "lucide-react";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import { CoordinationHeading } from "@/composition/presentation/coordination-ui";
import { Metric, money } from "@/composition/presentation/workspace-ui";
import { analyzeSchedule } from "@/bounded-contexts/project-scheduling";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
/** Risk indicators are calculated from the project's dates, dependencies and recorded costs. */
export function ReportsScreen() {
  const { data } = useWorkspace(),
    { t, locale } = useI18n();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!data) return null;
  const today = new Date().toISOString().slice(0, 10),
    overdue = data.tasks.filter(
      (x) => x.status !== "done" && x.due_date < today,
    ),
    schedule = analyzeSchedule(data.tasks, data.coordination.dependencies),
    planned = data.budgetItems.reduce(
      (s, i) => s + i.quantity * i.unit_cost,
      0,
    ),
    actual = data.budgetItems.reduce((s, i) => s + i.actual_cost, 0);
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        "/api/v1/projects/" + data.project.id + "/reports?locale=" + locale,
      );
      if (!response.ok) throw new Error(t("c.reportError"));
      const url = URL.createObjectURL(await response.blob()),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "Teluria-" + data.project.name + ".pdf";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <CoordinationHeading
        title={t("c.reports")}
        description={t("c.reportsHelp")}
        actions={
          <button
            className="pm-button pm-primary"
            disabled={busy}
            onClick={() => void download()}
          >
            <Download size={16} />
            {t("c.exportPdf")}
          </button>
        }
      />
      {error && <p role="alert">{error}</p>}
      <div className="pm-metrics">
        <Metric label={t("c.overdue")} value={overdue.length} />
        <Metric
          label={t("c.blocked")}
          value={
            schedule.filter((x) => x.blocked && x.status !== "done").length
          }
        />
        <Metric
          label={t("c.criticalTasks")}
          value={
            schedule.filter((x) => x.critical && x.status !== "done").length
          }
        />
        <Metric
          label={t("pm.balance")}
          value={money(planned - actual, data.project.currency, locale)}
        />
      </div>
      <div className="pm-card collab-section">
        <h2>{t("c.attention")}</h2>
        {overdue.map((task) => (
          <div className="collab-list-row" key={task.id}>
            <AlertTriangle size={17} />
            <div>
              <strong>{task.title}</strong>
              <small>
                {task.assignee} · {task.due_date}
              </small>
            </div>
          </div>
        ))}
        {actual > planned && (
          <p className="pm-alert pm-danger">{t("pm.overBudget")}</p>
        )}
        {!overdue.length && actual <= planned && (
          <p className="pm-muted">{t("c.noAlerts")}</p>
        )}
      </div>
      <div className="pm-card collab-section">
        <h2>{t("c.supplierBreakdown")}</h2>
        {Array.from(
          new Set(data.budgetItems.map((c) => c.supplier || t("c.unassigned"))),
        ).map((supplier) => (
          <div className="collab-list-row" key={supplier}>
            <strong>{supplier}</strong>
            <span>
              {money(
                data.budgetItems
                  .filter((c) => (c.supplier || t("c.unassigned")) === supplier)
                  .reduce((s, c) => s + c.quantity * c.unit_cost, 0),
                data.project.currency,
                locale,
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

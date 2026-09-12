"use client";
import { useState } from "react";
import { Pencil, Plus, Ruler, Trash2, X } from "lucide-react";
import type { BudgetItem } from "../index";
import { planDigitization } from "@/bounded-contexts/plan-digitization/public";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import {
  ResourceDialog,
  resourceService,
} from "@/composition/presentation/resource-dialog";
import { Empty, Metric, money } from "@/composition/presentation/workspace-ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import { canManage } from "@/bounded-contexts/identity-access";
/** Estimates are calculated from editable quantities and unit costs, never synthetic progress. */
export function BudgetScreen() {
  const { data, mutate, busy } = useWorkspace();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<BudgetItem | null | undefined>();
  const [initial, setInitial] = useState<Record<string, unknown>>();
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  if (!data) return null;
  const manage = canManage(data.project.role);
  const planned = data.budgetItems.reduce(
      (sum, item) => sum + item.quantity * item.unit_cost,
      0,
    ),
    actual = data.budgetItems.reduce((sum, item) => sum + item.actual_cost, 0);
  const format = (n: number) => money(n, data.project.currency, locale);
  const estimate = async () => {
    setEstimating(true);
    setError("");
    try {
      const blueprint = await planDigitization.getBlueprint.execute(
        data.project.id,
      );
      setInitial({
        title: t("pm.areaEstimate"),
        quantity: Number(
          blueprint.rooms.reduce((sum, room) => sum + room.area, 0).toFixed(2),
        ),
        unit: "m²",
        category: "finishes",
        unit_cost: 0,
        actual_cost: 0,
      });
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEstimating(false);
    }
  };
  return (
    <div>
      <header className="pm-page-heading">
        <div>
          <p className="pm-eyebrow">{t("pm.costControl")}</p>
          <h1>{t("pm.budget")}</h1>
          <p>{t("pm.budgetHelp")}</p>
        </div>
        <div className="pm-actions">
          <button
            className="pm-button"
            onClick={() => void estimate()}
            disabled={estimating}
            hidden={!manage}
          >
            <Ruler size={16} />
            {t("pm.estimateArea")}
          </button>
          <button
            className="pm-button pm-primary"
            hidden={!manage}
            onClick={() => {
              setInitial(undefined);
              setEditing(null);
            }}
          >
            <Plus size={16} />
            {t("pm.newBudgetItem")}
          </button>
        </div>
      </header>
      <div className="pm-metrics">
        <Metric label={t("pm.plannedCost")} value={format(planned)} />
        <Metric label={t("pm.actualCost")} value={format(actual)} />
        <Metric label={t("pm.balance")} value={format(planned - actual)} />
        <Metric
          label={t("pm.budgetCap")}
          value={format(data.project.budget_total)}
        />
      </div>
      {actual > planned && (
        <p className="pm-alert pm-danger">{t("pm.overBudget")}</p>
      )}
      {error && <p role="alert">{error}</p>}
      {!data.budgetItems.length ? (
        <Empty title={t("pm.noBudgetItems")} description={t("pm.budgetHelp")} />
      ) : (
        <div className="pm-card pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                {["title", "quantity", "unit", "unit_cost"].map((k) => (
                  <th key={k}>{t("pm.field." + k)}</th>
                ))}
                <th>{t("pm.plannedCost")}</th>
                <th>{t("pm.actualCost")}</th>
                {manage && <th>{t("pm.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {data.budgetItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      className="pm-text-button"
                      onClick={() => {
                        if (data.project.role !== "collaborator")
                          setEditing(item);
                      }}
                    >
                      {item.title}
                    </button>
                    <small>
                      {t("pm.status." + item.category, item.category)} ·{" "}
                      {item.supplier || t("c.unassigned")} ·{" "}
                      {t("pm.status." + item.stage, item.stage)}
                    </small>
                  </td>
                  <td>{item.quantity}</td>
                  <td>{t("pm.status." + item.unit, item.unit)}</td>
                  <td>{format(item.unit_cost)}</td>
                  <td>{format(item.quantity * item.unit_cost)}</td>
                  <td>{format(item.actual_cost)}</td>
                  {manage && (
                    <td>
                      {pendingDeleteId === item.id ? (
                        <div
                          className="pm-budget-confirm"
                          role="group"
                          aria-label={t("pm.confirmDelete")}
                        >
                          <button
                            className="pm-button pm-small pm-button-danger"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                await mutate(() =>
                                  resourceService("budgetItems").delete(
                                    data.project.id,
                                    item as BudgetItem &
                                      Record<string, unknown>,
                                  ),
                                )
                              )
                                setPendingDeleteId(null);
                            }}
                          >
                            <Trash2 size={13} />
                            {t("pm.confirmDelete")}
                          </button>
                          <button
                            className="pm-icon-button"
                            aria-label={t("pm.cancel")}
                            onClick={() => setPendingDeleteId(null)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="pm-budget-actions">
                          <button
                            className="pm-icon-button"
                            aria-label={`${t("pm.edit")} · ${item.title}`}
                            onClick={() => setEditing(item)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="pm-icon-button pm-budget-delete"
                            aria-label={`${t("pm.delete")} · ${item.title}`}
                            onClick={() => setPendingDeleteId(item.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="pm-footnote">{t("pm.estimateDisclaimer")}</p>
      {editing !== undefined && (
        <ResourceDialog
          resource="budgetItems"
          item={editing ?? undefined}
          initial={initial}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

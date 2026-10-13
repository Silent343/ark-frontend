"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Box,
  CalendarDays,
  CheckCircle2,
  Maximize2,
  PenLine,
  Users,
  UploadCloud,
  WalletCards,
} from "lucide-react";
import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import { planDigitization } from "@/bounded-contexts/plan-digitization/public";
import { useWorkspace, progressOf } from "./workspace-context";
import { Dialog, Field, Status, money, dateLabel } from "./workspace-ui";
import { requestJson } from "@/shared/infrastructure/rest-client";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import { ProjectCoverField } from "@/bounded-contexts/project-management/presentation/components/project-cover-field";
import { CadPlanCanvas } from "@/bounded-contexts/plan-digitization/presentation/components/cad-plan-canvas";

const BlueprintCanvas = dynamic(
  () =>
    import("@/bounded-contexts/plan-digitization/presentation/components/blueprint-canvas").then(
      (module) => module.BlueprintCanvas,
    ),
  { loading: () => <div className="pm-plan-preview-loading" /> },
);

/** Returns compact initials for avatar fallbacks when a member has no uploaded photo. */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Project home keeps the plan, critical work and current health in the first viewport. */
export function OverviewScreen() {
  const { data, mutate, busy, error } = useWorkspace();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [coverImage, setCoverImage] = useState("");
  const [previewBlueprint, setPreviewBlueprint] = useState<Blueprint | null>(
    null,
  );

  useEffect(() => {
    if (!data?.project.id) return;
    let active = true;
    void planDigitization.getBlueprint
      .execute(data.project.id)
      .then((blueprint) => {
        if (active) setPreviewBlueprint(blueprint);
      })
      .catch(() => {
        if (active) setPreviewBlueprint(null);
      });
    return () => {
      active = false;
    };
  }, [data?.project.id]);

  if (!data) return null;
  const { project } = data;
  const root = "/projects/" + project.id;
  const hasSource = !!(
    previewBlueprint?.cad ||
    previewBlueprint?.sourceImage ||
    previewBlueprint?.sheets?.length
  );
  const hasModel = !!(
    previewBlueprint?.walls.length ||
    previewBlueprint?.columns.length ||
    previewBlueprint?.roofs?.length
  );
  const planAction =
    root +
    (hasModel
      ? "/model"
      : "/editor?mode=edit" + (hasSource ? "" : "&import=1"));
  const purpose =
    previewBlueprint?.intent &&
    {
      visualization: "Exploración 3D",
      coordination: "Revisión y coordinación",
      "bim-preparation": "Preparación de información BIM",
    }[previewBlueprint.intent];
  const progress = progressOf(data.tasks);
  const actual = data.budgetItems.reduce(
    (sum, item) => sum + item.actual_cost,
    0,
  );
  const upcoming = [...data.milestones]
    .filter((milestone) => milestone.status !== "completed")
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const visibleActivities = data.activities.slice(0, 8);
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  // Only actionable states appear here; summary metrics remain separate from work to resolve.
  const attentionItems = [
    {
      key: "milestones",
      count: data.milestones.filter(
        (milestone) =>
          milestone.status !== "completed" && milestone.due_date < today,
      ).length,
      href: root + "/milestones",
    },
    {
      key: "overdue",
      count: data.tasks.filter(
        (task) => task.status !== "done" && task.due_date < today,
      ).length,
      href: root + "/tasks",
    },
    {
      key: "review",
      count: data.tasks.filter((task) => task.status === "review").length,
      href: root + "/tasks",
    },
    {
      key: "approvals",
      count: data.approvals.filter((approval) => approval.status === "pending")
        .length,
      href: root + "/approvals",
    },
    {
      key: "issues",
      count: data.issues.filter((issue) => issue.status !== "resolved").length,
      href: root + "/issues",
    },
  ].filter((item) => item.count > 0);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      ...input,
      budget_total: Number(input.budget_total),
      cover_image: coverImage,
    };
    if (
      await mutate(() =>
        requestJson("/api/v1/projects/" + project.id, {
          method: "PATCH",
          headers: { "If-Match": JSON.stringify(project.updated_at) },
          body: JSON.stringify(payload),
        }),
      )
    )
      setEditing(false);
  };

  return (
    <div>
      <header className="pm-page-heading pm-project-heading">
        <div>
          <p className="pm-eyebrow">{t("pm.projectOverview")}</p>
          <h1>{project.name}</h1>
          <p>
            {project.location} ·{" "}
            {project.client_name || t("pm.clientNotAssigned")}
          </p>
          {purpose && <span className="pm-project-purpose">{purpose}</span>}
        </div>
        <div className="pm-actions">
          <button
            hidden={project.role === "collaborator"}
            className="pm-button"
            onClick={() => {
              setCoverImage(project.coverImage);
              setEditing(true);
            }}
          >
            <PenLine size={15} />
            {t("pm.editProject")}
          </button>
          <Link className="pm-button pm-primary" href={planAction}>
            {hasModel ? <Box size={16} /> : <UploadCloud size={16} />}
            {hasModel
              ? t("pm.openStudio")
              : hasSource
                ? "Revisar plano"
                : "Agregar primer plano"}
          </Link>
        </div>
      </header>

      <div className="pm-overview-metrics">
        <article className="pm-card pm-overview-stat">
          <span>{t("pm.generalProgress", "Progreso general")}</span>
          <strong>{progress}%</strong>
          <div className="pm-progress-track" aria-hidden="true">
            <span style={{ width: progress + "%" }} />
          </div>
        </article>
        <article className="pm-card pm-overview-stat">
          <span>{t("pm.executedBudget", "Presupuesto ejecutado")}</span>
          <strong>{money(actual, project.currency, locale)}</strong>
          <small>
            {t("pm.ofBudget", "de")}{" "}
            {money(project.budget_total, project.currency, locale)}
          </small>
        </article>
        <article className="pm-card pm-overview-stat">
          <span>{t("pm.nextMilestone", "Próximo hito")}</span>
          <strong className="pm-overview-stat-title">
            {upcoming[0]?.title ?? t("pm.planNextMilestone")}
          </strong>
          <small>
            {upcoming[0]
              ? dateLabel(upcoming[0].due_date, locale)
              : t("pm.noMilestones")}
          </small>
        </article>
        <article className="pm-card pm-overview-stat">
          <span>{t("pm.activeMembers", "Miembros activos")}</span>
          <div className="pm-member-summary">
            <div className="pm-avatar-stack" aria-hidden="true">
              {data.coordination.members.slice(0, 4).map((member, index) => (
                <span key={member.id} data-tone={index % 4}>
                  {initials(member.name)}
                </span>
              ))}
            </div>
            <strong>{data.coordination.members.length}</strong>
          </div>
          <small>{t("pm.projectTeam", "equipo del proyecto")}</small>
        </article>
      </div>

      <section className="pm-attention" aria-labelledby="pm-attention-title">
        <div className="pm-section-heading">
          <div>
            <p className="pm-eyebrow">{t("pm.attention.eyebrow")}</p>
            <h2 id="pm-attention-title">
              {attentionItems.length
                ? t("pm.attention.title")
                : "Coordinación al día"}
            </h2>
          </div>
        </div>
        {attentionItems.length ? (
          <div className="pm-attention-list">
            {attentionItems.map((item) => (
              <Link
                className="pm-attention-item"
                href={item.href}
                key={item.key}
              >
                <strong>{item.count}</strong>
                <span>{t("pm.attention." + item.key)}</span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="pm-attention-clear">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>{t("pm.attention.clear")}</span>
            <Link href={root + "/milestones"}>
              {t("pm.attention.planNext")}
            </Link>
          </div>
        )}
      </section>

      <div className="pm-project-dashboard-grid">
        <section className="pm-card pm-plan-overview">
          <div className="pm-section-heading">
            <h2>{t("pm.planVisualization", "Visualización del plano 2D")}</h2>
            <Link
              href={root + "/editor"}
              aria-label={t("pm.openPlanPreview", "Abrir vista del plano")}
            >
              <Maximize2 size={16} />
            </Link>
          </div>
          <div
            className="pm-plan-preview"
            aria-label={t("pm.planPreview", "Vista previa del plano")}
          >
            {previewBlueprint && !hasSource && !hasModel ? (
              <div className="pm-plan-empty-start">
                <UploadCloud size={28} />
                <h3>El proyecto está listo para recibir tus planos</h3>
                <p>
                  Agrega un CAD, PDF o imagen. Después revisarás escala, plantas
                  y elementos antes de abrir el modelo 3D.
                </p>
                <Link className="pm-button pm-primary" href={planAction}>
                  Agregar primer plano
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            ) : previewBlueprint?.cad ? (
              <div style={{ width: "100%", height: 260 }}>
                <CadPlanCanvas plan={previewBlueprint.cad} />
              </div>
            ) : previewBlueprint ? (
              <div
                className="pm-plan-preview-canvas"
                style={{
                  aspectRatio: `${previewBlueprint.width}/${previewBlueprint.height}`,
                }}
              >
                <BlueprintCanvas blueprint={previewBlueprint} />
              </div>
            ) : (
              <div className="pm-plan-preview-loading" />
            )}
          </div>
          <div className="pm-plan-preview-footer">
            <span>
              {hasSource || hasModel
                ? t("pm.semanticPlan", "Plano semántico del proyecto")
                : "Sin planos importados"}
            </span>
            <Link href={root + "/editor?mode=edit"}>
              {t("pm.openInEditor", "Abrir en editor")}
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </section>

        <section className="pm-card pm-critical-deliverables">
          <div className="pm-section-heading">
            <h2>{t("pm.criticalDeliverables", "Entregables críticos")}</h2>
            <Link href={root + "/milestones"}>{t("pm.viewAll")}</Link>
          </div>
          {upcoming.length ? (
            upcoming.slice(0, 4).map((milestone) => (
              <Link
                href={root + "/milestones"}
                key={milestone.id}
                className="pm-critical-row"
              >
                <CalendarDays size={16} />
                <span>
                  <strong>{milestone.title}</strong>
                  <small>
                    {milestone.owner} · {dateLabel(milestone.due_date, locale)}
                  </small>
                </span>
                <Status value={milestone.status} />
              </Link>
            ))
          ) : (
            <p className="pm-muted">{t("pm.noMilestones")}</p>
          )}
        </section>
      </div>

      <div className="pm-overview-lower">
        <section className="pm-card pm-section pm-activity-panel">
          <div className="pm-section-heading">
            <h2>{t("pm.recentActivity")}</h2>
            <CheckCircle2 size={18} />
          </div>
          <div className="pm-activity-scroll">
            {visibleActivities.length ? (
              visibleActivities.map((activity) => (
                <div className="pm-activity" key={activity.id}>
                  <span className="pm-activity-dot" />
                  <div>
                    <p>{activity.title}</p>
                    <small>
                      {t("pm.action." + activity.action, activity.action)} ·{" "}
                      {dateLabel(activity.created_at.slice(0, 10), locale)}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p className="pm-muted">{t("pm.noActivity")}</p>
            )}
          </div>
        </section>
        <section className="pm-card pm-section pm-design-shortcuts">
          <div className="pm-section-heading">
            <h2>{t("pm.designTools")}</h2>
            <Users size={18} />
          </div>
          <div className="pm-tool-links">
            {[
              ["editor", "plans"],
              ["model", "model"],
              ["simulation", "simulation"],
            ].map(([slug, key]) => (
              <Link href={root + "/" + slug} key={slug}>
                {t("pm." + key)}
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
          <div className="pm-budget-summary">
            <WalletCards size={17} />
            <span>
              {t("pm.balance")}
              <strong>
                {money(project.budget_total - actual, project.currency, locale)}
              </strong>
            </span>
            <Link href={root + "/budget-items"}>{t("pm.viewAll")}</Link>
          </div>
        </section>
      </div>

      {editing && (
        <Dialog title={t("pm.editProject")} onClose={() => setEditing(false)}>
          <form className="pm-form" onSubmit={save}>
            {error && (
              <p role="alert" className="pm-alert pm-danger">
                {error}
              </p>
            )}
            <div className="pm-form-grid">
              {(
                [
                  "name",
                  "location",
                  "client_name",
                  "owner_name",
                  "target_date",
                  "budget_total",
                ] as const
              ).map((key) => (
                <Field key={key} label={t("pm.field." + key)}>
                  <input
                    name={key}
                    type={
                      key === "target_date"
                        ? "date"
                        : key === "budget_total"
                          ? "number"
                          : "text"
                    }
                    defaultValue={project[key]}
                    min={key === "budget_total" ? 0 : undefined}
                    required={
                      key === "name" ||
                      key === "location" ||
                      key === "budget_total"
                    }
                    maxLength={200}
                  />
                </Field>
              ))}
              <Field label={t("pm.field.phase")}>
                <select name="phase" defaultValue={project.phase}>
                  {[
                    "proposal",
                    "design",
                    "review",
                    "construction",
                    "delivered",
                  ].map((phase) => (
                    <option key={phase} value={phase}>
                      {t("pm.status." + phase)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("pm.field.currency")}>
                <select name="currency" defaultValue={project.currency}>
                  {["PEN", "USD", "EUR"].map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </Field>
            </div>
            <ProjectCoverField
              value={coverImage}
              disabled={busy}
              onChange={setCoverImage}
            />
            <div className="pm-dialog-actions">
              <button
                type="button"
                className="pm-button"
                onClick={() => setEditing(false)}
              >
                {t("pm.cancel")}
              </button>
              <button
                disabled={busy}
                type="submit"
                className="pm-button pm-primary"
              >
                {t("pm.save")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

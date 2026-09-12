"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Plus,
  Search,
  Grid2X2,
  List,
  ArrowUpRight,
  MapPin,
} from "lucide-react";
import { useProjects } from "../hooks/use-projects";
import type { ManagedProject } from "@/composition/presentation/workspace-context";
import {
  Status,
  Empty,
  WorkspaceSkeleton,
  money,
  dateLabel,
} from "@/composition/presentation/workspace-ui";
import { selectActiveProject } from "@/shared/presentation/hooks/use-active-project";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
interface PortfolioProject extends ManagedProject {
  management: {
    progress: number;
    open_issues: number;
    pending_approvals: number;
    budget_actual: number;
    task_count: number;
    next_milestone: string;
  };
}
/** Portfolio shows management progress, independently from blueprint analysis progress. */
export function DashboardScreen() {
  const { data, loading, error, reload } = useProjects();
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState("");
  const [view, setView] = useState("grid");
  if (loading) return <WorkspaceSkeleton />;
  const projects = (data ?? []) as PortfolioProject[];
  const filtered = projects.filter(
    (p) =>
      (p.name + " " + p.location + " " + p.client_name)
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!phase || p.phase === phase),
  );
  return (
    <div className="pm-workspace">
      <header className="pm-page-heading">
        <div>
          <p className="pm-eyebrow">{t("pm.studioManagement")}</p>
          <h1>{t("pm.portfolio")}</h1>
          <p>{t("pm.portfolioHelp")}</p>
        </div>
        <div className="pm-actions">
          <Link className="pm-button pm-primary" href="/projects/new">
            <Plus size={17} />
            {t("pm.newProject")}
          </Link>
        </div>
      </header>
      <div className="pm-portfolio-main">
        <div className="pm-toolbar">
          <label className="pm-search">
            <Search size={16} />
            <input
              aria-label={t("pm.search")}
              placeholder={t("pm.searchProjects")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label={t("pm.field.phase")}
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
          >
            <option value="">{t("pm.allPhases")}</option>
            {["proposal", "design", "review", "construction", "delivered"].map(
              (p) => (
                <option key={p} value={p}>
                  {t("pm.status." + p)}
                </option>
              ),
            )}
          </select>
          <div className="pm-segment">
            <button
              aria-label={t("pm.gridView")}
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <Grid2X2 size={17} />
            </button>
            <button
              aria-label={t("pm.listView")}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={17} />
            </button>
          </div>
        </div>
        {error ? (
          <div className="pm-alert pm-danger" role="alert">
            {error}
            <button onClick={reload}>{t("pm.retry")}</button>
          </div>
        ) : !filtered.length ? (
          <Empty
            title={t("pm.noProjects")}
            description={t("pm.emptyProjectsHelp")}
          />
        ) : view === "grid" ? (
          <div className="pm-project-grid">
            {filtered.map((project, i) => (
              <Link
                key={project.id}
                href={"/projects/" + project.id}
                onClick={() => selectActiveProject(project.id)}
                className="pm-card pm-project-card"
              >
                <div className={"pm-project-art pm-art-" + (i % 3)}>
                  <span className="pm-art-label">
                    {t("pm.workspace")} / {String(i + 1).padStart(2, "0")}
                  </span>
                  <svg viewBox="0 0 360 155" aria-hidden="true">
                    <g fill="none" stroke="currentColor" strokeWidth="1.3">
                      <path d="M70 112V56l108-37 113 42v59l-108 31-113-39M70 56l113 43 108-38M183 99v52M111 71v54M224 87v50M70 86l113 42 108-38" />
                      <path
                        d="M100 46l112 43M135 34l112 43M110 124V82l40 15v43M220 118V98l34-11v21M42 125l140 49 139-42"
                        opacity=".6"
                      />
                    </g>
                  </svg>
                  <span className="pm-art-floors">
                    {project.floors}{" "}
                    {t(project.floors === 1 ? "pm.level" : "pm.levels")}
                  </span>
                </div>
                <div className="pm-project-body">
                  <div className="pm-row">
                    <Status value={project.phase} />
                    <ArrowUpRight size={18} />
                  </div>
                  <h2>{project.name}</h2>
                  <p className="pm-location">
                    <MapPin size={13} />
                    {project.location}
                  </p>
                  <div className="pm-project-progress">
                    <span>{t("pm.progress")}</span>
                    <strong>{project.management?.progress ?? 0}%</strong>
                  </div>
                  <div className="pm-progress-track">
                    <span
                      style={{
                        width: (project.management?.progress ?? 0) + "%",
                      }}
                    />
                  </div>
                  <div className="pm-card-footer">
                    <span>{project.owner_name}</span>
                    <span>{dateLabel(project.target_date, locale)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="pm-card pm-table-wrap">
            <table className="pm-table">
              <thead>
                <tr>
                  <th>{t("pm.project")}</th>
                  <th>{t("pm.field.phase")}</th>
                  <th>{t("pm.progress")}</th>
                  <th>{t("pm.actualCost")}</th>
                  <th>{t("pm.targetDelivery")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link
                        className="pm-text-button"
                        href={"/projects/" + p.id}
                      >
                        {p.name}
                      </Link>
                      <small>{p.client_name}</small>
                    </td>
                    <td>
                      <Status value={p.phase} />
                    </td>
                    <td>{p.management?.progress ?? 0}%</td>
                    <td>
                      {money(
                        p.management?.budget_actual ?? 0,
                        p.currency,
                        locale,
                      )}
                    </td>
                    <td>{dateLabel(p.target_date, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

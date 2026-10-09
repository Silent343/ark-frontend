"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { requestJson } from "@/shared/infrastructure/rest-client";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import {
  WorkspaceSkeleton,
  Empty,
} from "@/composition/presentation/workspace-ui";
interface Entry {
  id: string;
  date: string;
  title: string;
  project_id: string;
  project_name: string;
  route: string;
}
/** Aggregates accessible team calendars; every underlying REST request independently verifies membership. */
export function StudioCalendarScreen() {
  const { t, locale } = useI18n(),
    [rows, setRows] = useState<Entry[] | null>(null),
    [error, setError] = useState(""),
    [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)),
    [project, setProject] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      const projects =
        await requestJson<{ id: string; name: string; role: string }[]>(
          "/api/v1/projects",
        );
      const all = await Promise.all(
        projects
          .filter((p) => p.role !== "client")
          .map(async (p) => {
            const collections = await Promise.all(
              ["calendar-events", "tasks", "milestones"].map((resource) =>
                requestJson<
                  {
                    id: string;
                    title: string;
                    start_at?: string;
                    due_date?: string;
                  }[]
                >("/api/v1/projects/" + p.id + "/" + resource),
              ),
            );
            return collections.flatMap((items, index) =>
              items.map((item) => ({
                id: item.id,
                date: (item.start_at ?? item.due_date ?? "").slice(0, 10),
                title: item.title,
                project_id: p.id,
                project_name: p.name,
                route:
                  index === 0
                    ? "schedule"
                    : index === 1
                      ? "tasks"
                      : "milestones",
              })),
            );
          }),
      );
      if (active)
        setRows(all.flat().sort((a, b) => a.date.localeCompare(b.date)));
    })().catch((e) => {
      if (active) setError((e as Error).message);
    });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <div className="pm-card pm-empty" role="alert">
        {error}
        <Link href="/projects">{t("pm.back")}</Link>
      </div>
    );
  if (!rows) return <WorkspaceSkeleton />;
  const filtered = rows.filter(
    (r) => r.date.startsWith(month) && (!project || r.project_id === project),
  );
  return (
    <div className="pm-workspace">
      <header className="pm-page-heading">
        <div>
          <p className="pm-eyebrow">ARK</p>
          <h1>{t("c.globalCalendar")}</h1>
          <p>{t("c.globalCalendarHelp")}</p>
        </div>
        <Link className="pm-button" href="/projects">
          {t("pm.portfolio")}
        </Link>
      </header>
      <div className="pm-toolbar">
        <input
          aria-label={t("c.calendar")}
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <select
          aria-label={t("c.project")}
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">{t("pm.portfolio")}</option>
          {Array.from(
            new Map(rows.map((r) => [r.project_id, r.project_name])),
          ).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {!filtered.length ? (
        <Empty
          title={t("c.noEvents")}
          description={t("c.globalCalendarHelp")}
        />
      ) : (
        <div className="pm-card collab-section">
          {filtered.map((row) => (
            <Link
              className="collab-list-row"
              key={row.id}
              href={"/projects/" + row.project_id + "/" + row.route}
            >
              <span className="pm-status">
                {new Intl.DateTimeFormat(locale, {
                  month: "short",
                  day: "numeric",
                }).format(new Date(row.date + "T12:00:00"))}
              </span>
              <span className="collab-flex">
                <strong>{row.title}</strong>
                <small>{row.project_name}</small>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

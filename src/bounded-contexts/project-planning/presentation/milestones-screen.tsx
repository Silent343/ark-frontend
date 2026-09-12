"use client";

import { useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import type { Milestone } from "../index";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import { ResourceDialog } from "@/composition/presentation/resource-dialog";
import {
  Status,
  Empty,
  dateLabel,
} from "@/composition/presentation/workspace-ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";

interface TimelineYearGroup {
  year: number;
  start: number;
  count: number;
}

/**
 * Project chronology expressed as an editable, month-based Gantt.
 * Dates remain readable in each row and appear again when a bar is hovered or focused.
 */
export function MilestonesScreen() {
  const { data } = useWorkspace();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<Milestone | null | undefined>();
  if (!data) return null;

  const rows = [...data.milestones].sort((a, b) =>
    a.start_date.localeCompare(b.start_date),
  );
  const first = rows.length
    ? Math.min(...rows.map((row) => Date.parse(row.start_date)))
    : 0;
  const last = rows.length
    ? Math.max(...rows.map((row) => Date.parse(row.due_date)))
    : first;
  const firstDate = new Date(first);
  const lastDate = new Date(last);
  const timelineStart = Date.UTC(
    firstDate.getUTCFullYear(),
    firstDate.getUTCMonth(),
    1,
  );
  const startMonthIndex =
    firstDate.getUTCFullYear() * 12 + firstDate.getUTCMonth();
  const lastMonthIndex =
    lastDate.getUTCFullYear() * 12 + lastDate.getUTCMonth();
  const monthCount = Math.max(6, lastMonthIndex - startMonthIndex + 1);
  const timelineEnd = Date.UTC(
    firstDate.getUTCFullYear(),
    firstDate.getUTCMonth() + monthCount,
    1,
  );
  const span = Math.max(86400000, timelineEnd - timelineStart);
  const timelineMonths = Array.from(
    { length: monthCount },
    (_, index) =>
      new Date(
        Date.UTC(
          firstDate.getUTCFullYear(),
          firstDate.getUTCMonth() + index,
          1,
        ),
      ),
  );
  const yearGroups = timelineMonths.reduce<TimelineYearGroup[]>(
    (groups, month, index) => {
      const year = month.getUTCFullYear();
      const current = groups.at(-1);
      if (current?.year === year) current.count += 1;
      else groups.push({ year, start: index, count: 1 });
      return groups;
    },
    [],
  );

  return (
    <div>
      <header className="pm-page-heading">
        <div>
          <p className="pm-eyebrow">{t("pm.planning")}</p>
          <h1>{t("pm.milestones")}</h1>
          <p>{t("pm.milestonesHelp")}</p>
        </div>
        <button
          className="pm-button pm-primary"
          onClick={() => setEditing(null)}
        >
          <Plus size={16} />
          {t("pm.newMilestone")}
        </button>
      </header>

      {!rows.length ? (
        <Empty
          title={t("pm.noMilestones")}
          description={t("pm.milestonesHelp")}
        />
      ) : (
        <div className="pm-card pm-timeline">
          <div
            className="pm-timeline-table"
            style={{ "--timeline-month-count": monthCount } as CSSProperties}
          >
            <div className="pm-timeline-heading">
              <span className="pm-timeline-heading-label">
                {t("pm.deliverable")}
              </span>
              <div className="pm-timeline-scale">
                <div className="pm-timeline-years">
                  {yearGroups.map((group) => (
                    <span
                      key={`${group.year}-${group.start}`}
                      style={{
                        gridColumn: `${group.start + 1} / span ${group.count}`,
                      }}
                    >
                      {group.year}
                    </span>
                  ))}
                </div>
                <div className="pm-timeline-months">
                  {timelineMonths.map((month) => (
                    <span key={month.toISOString()}>
                      {new Intl.DateTimeFormat(locale, {
                        month: "long",
                        timeZone: "UTC",
                      }).format(month)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {rows.map((row) => {
              const start = Date.parse(`${row.start_date}T00:00:00Z`);
              const finish = Date.parse(`${row.due_date}T00:00:00Z`) + 86400000;
              const left = Math.max(0, ((start - timelineStart) / span) * 100);
              const width = Math.max(
                2,
                Math.min(100 - left, ((finish - start) / span) * 100),
              );
              const range = `${dateLabel(row.start_date, locale)} — ${dateLabel(row.due_date, locale)}`;

              return (
                <div className="pm-timeline-row" key={row.id}>
                  <button
                    className="pm-timeline-label"
                    onClick={() => setEditing(row)}
                  >
                    <strong>{row.title}</strong>
                    <small>
                      {row.owner} · {range}
                    </small>
                    <Status value={row.status} />
                  </button>
                  <div className="pm-timeline-track">
                    <button
                      aria-label={`${t("pm.edit")} ${row.title}: ${range}`}
                      title={`${row.title} · ${range}`}
                      onClick={() => setEditing(row)}
                      className={`pm-timeline-bar pm-bar-${row.status}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      <span className="pm-timeline-bar-label">{row.title}</span>
                      <span className="pm-timeline-tooltip" role="tooltip">
                        {range}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editing !== undefined && (
        <ResourceDialog
          resource="milestones"
          item={editing ?? undefined}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

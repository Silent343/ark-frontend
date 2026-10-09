"use client";

import { useState, type CSSProperties } from "react";
import { CalendarRange, GanttChartSquare, Minus, Plus } from "lucide-react";
import type { Milestone } from "../index";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import { ResourceDialog } from "@/composition/presentation/resource-dialog";
import {
  Status,
  Empty,
  dateLabel,
} from "@/composition/presentation/workspace-ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";

const DAY = 86_400_000;
const WEEK = DAY * 7;

interface TimelineMonthGroup {
  key: string;
  label: string;
  start: number;
  count: number;
}

/** Returns Monday at 00:00 UTC so visual positions stay stable across local time zones. */
function startOfUtcWeek(timestamp: number) {
  const date = new Date(timestamp);
  const offset = (date.getUTCDay() + 6) % 7;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - offset,
  );
}

/** ISO week number used by the compact planning scale. */
function isoWeek(date: Date) {
  const target = new Date(date);
  target.setUTCHours(0, 0, 0, 0);
  target.setUTCDate(target.getUTCDate() + 3 - ((target.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  return (
    1 +
    Math.round(
      (target.getTime() - startOfUtcWeek(firstThursday.getTime())) / WEEK,
    )
  );
}

/**
 * Editable project GANT with month and week scales.
 * Bars expose their exact dates on hover and focus without hiding row context.
 */
export function MilestonesScreen() {
  const { data } = useWorkspace();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<Milestone | null | undefined>();
  const [weekWidth, setWeekWidth] = useState(104);
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
  const timelineStart = startOfUtcWeek(
    Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1),
  );
  const finalWeekEnd = startOfUtcWeek(last) + WEEK;
  const timelineEnd = Math.max(finalWeekEnd, timelineStart + WEEK * 12);
  const weekCount = Math.ceil((timelineEnd - timelineStart) / WEEK);
  const span = weekCount * WEEK;
  const weeks = Array.from(
    { length: weekCount },
    (_, index) => new Date(timelineStart + index * WEEK),
  );
  const monthGroups = weeks.reduce<TimelineMonthGroup[]>(
    (groups, week, index) => {
      const key = `${week.getUTCFullYear()}-${week.getUTCMonth()}`;
      const current = groups.at(-1);
      if (current?.key === key) current.count += 1;
      else
        groups.push({
          key,
          start: index,
          count: 1,
          label: new Intl.DateTimeFormat(locale, {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(week),
        });
      return groups;
    },
    [],
  );
  const timelineStyle = {
    "--timeline-week-count": weekCount,
    "--timeline-week-width": `${weekWidth}px`,
  } as CSSProperties;

  return (
    <div>
      <header className="pm-page-heading">
        <div>
          <p className="pm-eyebrow">{t("pm.planning")}</p>
          <h1>{t("pm.gantt")}</h1>
          <p>{t("pm.ganttHelp")}</p>
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
        <Empty title={t("pm.noMilestones")} description={t("pm.ganttHelp")} />
      ) : (
        <div className="pm-card pm-timeline">
          <div className="pm-gantt-toolbar">
            <strong>
              <GanttChartSquare size={17} />
              {t("pm.gantt")}
            </strong>
            <div className="pm-gantt-zoom">
              <span>
                <CalendarRange size={15} />
                {t("pm.weeks")}
              </span>
              <button
                type="button"
                disabled={weekWidth <= 72}
                aria-label={t("pm.zoomOut")}
                onClick={() =>
                  setWeekWidth((current) => Math.max(72, current - 16))
                }
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                disabled={weekWidth >= 152}
                aria-label={t("pm.zoomIn")}
                onClick={() =>
                  setWeekWidth((current) => Math.min(152, current + 16))
                }
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="pm-timeline-scroll">
            <div className="pm-timeline-table" style={timelineStyle}>
              <div className="pm-timeline-heading">
                <span className="pm-timeline-heading-label">
                  {t("pm.deliverable")}
                </span>
                <div className="pm-timeline-scale">
                  <div className="pm-timeline-months">
                    {monthGroups.map((group) => (
                      <span
                        key={group.key}
                        style={{
                          gridColumn: `${group.start + 1} / span ${group.count}`,
                        }}
                      >
                        {group.label}
                      </span>
                    ))}
                  </div>
                  <div className="pm-timeline-weeks">
                    {weeks.map((week) => {
                      const end = new Date(week.getTime() + DAY * 6);
                      return (
                        <span key={week.toISOString()}>
                          W{isoWeek(week)} ·{" "}
                          {new Intl.DateTimeFormat(locale, {
                            day: "numeric",
                            month: "short",
                            timeZone: "UTC",
                          }).format(week)}
                          –{end.getUTCDate()}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {rows.map((row) => {
                const start = Date.parse(`${row.start_date}T00:00:00Z`);
                const finish = Date.parse(`${row.due_date}T00:00:00Z`) + DAY;
                const left = Math.max(
                  0,
                  ((start - timelineStart) / span) * 100,
                );
                const width = Math.max(
                  1.5,
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
                        onClick={() => setEditing(row)}
                        className={`pm-timeline-bar pm-bar-${row.status}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <span className="pm-timeline-bar-label">
                          {row.title}
                        </span>
                        <span className="pm-timeline-tooltip" role="tooltip">
                          <strong>{row.title}</strong>
                          {range}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
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

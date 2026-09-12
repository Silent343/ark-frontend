"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronLeft, ChevronRight, Link2, Trash2 } from "lucide-react";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import {
  CoordinationHeading,
  CoordinationForm,
  useProjectActions,
} from "@/composition/presentation/coordination-ui";
import { Field } from "@/composition/presentation/workspace-ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import { canManage } from "@/bounded-contexts/identity-access";
import { type CalendarEvent } from "../index";
/** Planning owns calendar events and dependencies; the Gantt belongs to Cronograma. */
export function SchedulingScreen() {
  const { data, busy } = useWorkspace(),
    { t, locale } = useI18n(),
    actions = useProjectActions(),
    router = useRouter();
  const [month, setMonth] = useState(() =>
      new Date().toISOString().slice(0, 7),
    ),
    [editing, setEditing] = useState<CalendarEvent | null | undefined>(),
    [linking, setLinking] = useState(false),
    [confirm, setConfirm] = useState("");
  if (!data) return null;
  const { events, dependencies } = data.coordination,
    manage = canManage(data.project.role);
  const start = new Date(month + "-01T12:00:00"),
    days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate(),
    offset = (start.getDay() + 6) % 7;
  const shift = (delta: number) => {
    const next = new Date(start);
    next.setMonth(next.getMonth() + delta);
    setMonth(
      next.getFullYear() + "-" + String(next.getMonth() + 1).padStart(2, "0"),
    );
  };
  const calendarItems = [
    ...events.map((e) => ({
      id: e.id,
      date: e.start_at.slice(0, 10),
      title: e.title,
      kind: e.category,
      event: e,
    })),
    ...data.tasks.map((task) => ({
      id: task.id,
      date: task.due_date,
      title: task.title,
      kind: "task",
      event: undefined,
    })),
    ...data.milestones.map((m) => ({
      id: m.id,
      date: m.due_date,
      title: m.title,
      kind: "milestone",
      event: undefined,
    })),
  ];
  return (
    <div>
      <CoordinationHeading
        title={t("c.schedule")}
        description={t("c.scheduleHelp")}
        actions={
          manage && (
            <>
              <button
                className="pm-button"
                disabled={data.tasks.length < 2}
                onClick={() => setLinking(true)}
              >
                <Link2 size={15} />
                {t("c.addDependency")}
              </button>
              <button
                className="pm-button pm-primary"
                onClick={() => setEditing(null)}
              >
                <Plus size={15} />
                {t("c.newEvent")}
              </button>
            </>
          )
        }
      />
      <div className="pm-toolbar">
        <div className="pm-actions">
          <button
            className="pm-icon-button"
            aria-label={t("c.previousMonth")}
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <strong className="capitalize">
            {new Intl.DateTimeFormat(locale, {
              month: "long",
              year: "numeric",
            }).format(start)}
          </strong>
          <button
            className="pm-icon-button"
            aria-label={t("c.nextMonth")}
            onClick={() => shift(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="pm-card collab-calendar-wrap">
        <div className="collab-calendar">
          {Array.from({ length: 7 }, (_, index) => (
            <div className="collab-weekday" key={"w" + index}>
              {new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
                new Date(2026, 0, 5 + index),
              )}
            </div>
          ))}
          {Array.from({ length: offset + days }, (_, index) => {
            const day = index - offset + 1,
              date = month + "-" + String(day).padStart(2, "0");
            return (
              <div
                key={index}
                className={"collab-day " + (day < 1 ? "collab-day-empty" : "")}
              >
                <span>{day > 0 ? day : ""}</span>
                {day > 0 &&
                  calendarItems
                    .filter((item) => item.date === date)
                    .map((item) => (
                      <button
                        className={"collab-event collab-event-" + item.kind}
                        key={item.id}
                        onClick={() => {
                          if (item.event && manage) setEditing(item.event);
                          else if (!item.event)
                            router.push(
                              "/projects/" +
                                data.project.id +
                                "/" +
                                (item.kind === "task" ? "tasks" : "milestones"),
                            );
                        }}
                        title={item.title}
                      >
                        {item.title}
                      </button>
                    ))}
              </div>
            );
          })}
        </div>
      </div>
      {dependencies.length > 0 && (
        <div className="pm-card collab-section">
          <h2>{t("c.dependencies")}</h2>
          {dependencies.map((edge) => (
            <div className="collab-list-row" key={edge.id}>
              <span>
                {
                  data.tasks.find((task) => task.id === edge.predecessor_id)
                    ?.title
                }{" "}
                →{" "}
                {
                  data.tasks.find((task) => task.id === edge.successor_id)
                    ?.title
                }{" "}
                <small>
                  +{edge.lag_days} {t("c.days")}
                </small>
              </span>
              {manage && (
                <button
                  disabled={busy}
                  className="pm-button pm-small"
                  onClick={() => {
                    if (confirm !== edge.id) {
                      setConfirm(edge.id);
                      return;
                    }
                    void actions.remove("task-dependencies", edge);
                  }}
                >
                  <Trash2 size={14} />
                  {t(confirm === edge.id ? "pm.confirmDelete" : "pm.delete")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {editing !== undefined && (
        <CoordinationForm
          title={t(editing ? "c.editEvent" : "c.newEvent")}
          onClose={() => setEditing(undefined)}
          onDelete={
            editing
              ? () => actions.remove("calendar-events", editing)
              : undefined
          }
          onSubmit={(v) =>
            actions.save(
              "calendar-events",
              {
                ...v,
                start_at: new Date(String(v.start_at)).toISOString(),
                end_at: new Date(String(v.end_at)).toISOString(),
              },
              editing ?? undefined,
            )
          }
        >
          <Field label={t("pm.field.title")}>
            <input required name="title" defaultValue={editing?.title} />
          </Field>
          <div className="pm-form-grid">
            {["start_at", "end_at"].map((k) => (
              <Field key={k} label={t("c." + k)}>
                <input
                  required
                  type="datetime-local"
                  name={k}
                  defaultValue={
                    editing
                      ? new Date(
                          Date.parse(editing[k as "start_at" | "end_at"]) -
                            new Date().getTimezoneOffset() * 60000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : undefined
                  }
                />
              </Field>
            ))}
          </div>
          <Field label={t("c.category")}>
            <select
              name="category"
              defaultValue={editing?.category ?? "meeting"}
            >
              {["meeting", "deadline", "site_visit"].map((v) => (
                <option key={v} value={v}>
                  {t("c." + v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("pm.field.owner")}>
            <input
              name="owner"
              defaultValue={editing?.owner ?? data.project.owner_name}
            />
          </Field>
          <Field label={t("pm.field.location")}>
            <input name="location" defaultValue={editing?.location} />
          </Field>
          <Field label={t("pm.field.notes")}>
            <textarea name="notes" defaultValue={editing?.notes} />
          </Field>
        </CoordinationForm>
      )}
      {linking && (
        <CoordinationForm
          title={t("c.addDependency")}
          onClose={() => setLinking(false)}
          onSubmit={(v) =>
            actions.save("task-dependencies", {
              ...v,
              lag_days: Number(v.lag_days),
            })
          }
        >
          {["predecessor_id", "successor_id"].map((k) => (
            <Field key={k} label={t("c." + k)}>
              <select name={k} required>
                {data.tasks.map((task) => (
                  <option value={task.id} key={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <Field label={t("c.lag_days")}>
            <input
              name="lag_days"
              type="number"
              min={0}
              max={365}
              defaultValue={0}
            />
          </Field>
          <p className="pm-muted">{t("c.dependenciesHelp")}</p>
        </CoordinationForm>
      )}
    </div>
  );
}

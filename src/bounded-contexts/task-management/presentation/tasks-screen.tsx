"use client";
import { useState } from "react";
import { Plus, CalendarDays, UserRound } from "lucide-react";
import type { Task } from "../index";
import {
  useWorkspace,
  workspaceServices,
} from "@/composition/presentation/workspace-context";
import { ResourceDialog } from "@/composition/presentation/resource-dialog";
import { Status, dateLabel } from "@/composition/presentation/workspace-ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
/** Kanban offers keyboard-accessible status selectors as an alternative to drag-and-drop. */
export function TasksScreen() {
  const { data, mutate, busy } = useWorkspace();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<Task | null | undefined>();
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("");
  if (!data) return null;
  const filtered = data.tasks.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) &&
      (!priority || item.priority === priority),
  );
  return (
    <div>
      <header className="pm-page-heading">
        <div>
          <p className="pm-eyebrow">{t("pm.execution")}</p>
          <h1>{t("pm.tasks")}</h1>
          <p>{t("pm.tasksHelp")}</p>
        </div>
        <button
          className="pm-button pm-primary"
          onClick={() => setEditing(null)}
        >
          <Plus size={16} />
          {t("pm.newTask")}
        </button>
      </header>
      <div className="pm-toolbar">
        <input
          aria-label={t("pm.search")}
          placeholder={t("pm.searchTasks")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label={t("pm.field.priority")}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">{t("pm.allPriorities")}</option>
          {["high", "medium", "low"].map((p) => (
            <option key={p} value={p}>
              {t("pm.status." + p)}
            </option>
          ))}
        </select>
      </div>
      <div className="pm-kanban">
        {(["todo", "in_progress", "review", "done"] as const).map((status) => (
          <div
            key={status}
            className="pm-kanban-column"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (busy) return;
              const task = data.tasks.find(
                (task) => task.id === e.dataTransfer.getData("text/plain"),
              );
              if (task && task.status !== status)
                void mutate(() =>
                  workspaceServices.tasks.update(data.project.id, task, {
                    status,
                  }),
                );
            }}
          >
            <div className="pm-column-heading">
              <Status value={status} />
              <span>
                {filtered.filter((task) => task.status === status).length}
              </span>
            </div>
            {filtered
              .filter((task) => task.status === status)
              .map((task) => (
                <article
                  key={task.id}
                  className="pm-task-card"
                  draggable={!busy}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", task.id)
                  }
                >
                  <div className="pm-row">
                    <span className="pm-eyebrow">
                      {t("pm.status." + task.discipline, task.discipline)}
                    </span>
                    <Status value={task.priority} />
                  </div>
                  <button
                    className="pm-task-title"
                    onClick={() => setEditing(task)}
                  >
                    {task.title}
                  </button>
                  <p className="pm-muted pm-clamp">{task.description}</p>
                  <div className="pm-task-meta">
                    <span>
                      <UserRound size={13} />
                      {task.assignee}
                    </span>
                    <span>
                      <CalendarDays size={13} />
                      {dateLabel(task.due_date, locale)}
                    </span>
                  </div>
                  <select
                    disabled={busy}
                    aria-label={t("pm.field.status") + " · " + task.title}
                    value={task.status}
                    onChange={(e) =>
                      void mutate(() =>
                        workspaceServices.tasks.update(data.project.id, task, {
                          status: e.target.value as Task["status"],
                        }),
                      )
                    }
                  >
                    {["todo", "in_progress", "review", "done"].map((s) => (
                      <option key={s} value={s}>
                        {t("pm.status." + s)}
                      </option>
                    ))}
                  </select>
                </article>
              ))}
            {!filtered.some((task) => task.status === status) && (
              <p className="pm-column-empty">{t("pm.noTasks")}</p>
            )}
          </div>
        ))}
      </div>
      {editing !== undefined && (
        <ResourceDialog
          resource="tasks"
          item={editing ?? undefined}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

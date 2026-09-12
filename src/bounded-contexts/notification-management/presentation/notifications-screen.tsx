"use client";
import { useState } from "react";
import { Bell, Check } from "lucide-react";
import Link from "next/link";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import {
  CoordinationHeading,
  useProjectActions,
} from "@/composition/presentation/coordination-ui";
import { Empty } from "@/composition/presentation/workspace-ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
/** Read acknowledgements are scoped to the current recipient by the server. */
export function NotificationsScreen() {
  const { data, busy } = useWorkspace(),
    { t } = useI18n(),
    actions = useProjectActions();
  const [unread, setUnread] = useState(false);
  if (!data) return null;
  const rows = data.coordination.notifications.filter(
    (n) => !unread || !n.read_at,
  );
  return (
    <div>
      <CoordinationHeading
        title={t("c.notifications")}
        description={t("c.notificationsHelp")}
      />
      <label className="collab-checkbox">
        <input
          type="checkbox"
          checked={unread}
          onChange={(e) => setUnread(e.target.checked)}
        />
        {t("c.onlyUnread")}
      </label>
      {!rows.length ? (
        <Empty
          title={t("c.noNotifications")}
          description={t("c.notificationsHelp")}
        />
      ) : (
        <div className="pm-card collab-section">
          {[...rows].reverse().map((n) => (
            <div
              className={
                "collab-list-row " + (!n.read_at ? "collab-unread" : "")
              }
              key={n.id}
            >
              <Bell size={18} />
              <div className="collab-flex">
                <strong>{n.title}</strong>
                <small>{n.created_at.slice(0, 16).replace("T", " ")}</small>
                <Link
                  href={
                    "/projects/" +
                    data.project.id +
                    "/" +
                    ({
                      "deliverable-packages": "deliverables",
                      "calendar-events": "schedule",
                      "task-dependencies": "schedule",
                      projects: "",
                      blueprints: "model",
                      approvals:
                        data.project.role === "client"
                          ? "client-portal"
                          : "approvals",
                    }[n.resource] ?? n.resource)
                  }
                >
                  {t("c.openRelated")}
                </Link>
              </div>
              {!n.read_at && (
                <button
                  className="pm-button pm-small"
                  disabled={busy}
                  onClick={() =>
                    void actions.save(
                      "notifications",
                      { read_at: new Date().toISOString() },
                      n,
                    )
                  }
                >
                  <Check size={15} />
                  {t("c.markRead")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

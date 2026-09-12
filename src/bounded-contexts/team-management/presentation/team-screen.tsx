"use client";
import { useState } from "react";
import { Plus, Copy, Check } from "lucide-react";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import {
  CoordinationHeading,
  CoordinationForm,
  useProjectActions,
} from "@/composition/presentation/coordination-ui";
import { Field, Metric } from "@/composition/presentation/workspace-ui";
import { requestJson } from "@/shared/infrastructure/rest-client";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import { canManage } from "@/bounded-contexts/identity-access";
import type { Member } from "../index";
/** Displays real memberships and workload; invitation links are shown only to their creator. */
export function TeamScreen() {
  const { data, mutate, busy } = useWorkspace(),
    { t } = useI18n(),
    actions = useProjectActions();
  const [editing, setEditing] = useState<Member | null | undefined>(),
    [inviteUrl, setInviteUrl] = useState(""),
    [copied, setCopied] = useState(false);
  if (!data) return null;
  const { members, invitations } = data.coordination,
    manage = canManage(data.project.role);
  return (
    <div>
      <CoordinationHeading
        title={t("c.team")}
        description={t("c.teamHelp")}
        actions={
          manage && (
            <button
              className="pm-button pm-primary"
              onClick={() => setEditing(null)}
            >
              <Plus size={16} />
              {t("c.invite")}
            </button>
          )
        }
      />
      <div className="pm-metrics">
        <Metric label={t("c.members")} value={members.length} />
        <Metric
          label={t("c.pendingInvitations")}
          value={
            invitations.filter(
              (i) =>
                i.status === "pending" &&
                i.expires_at > new Date().toISOString(),
            ).length
          }
        />
        <Metric
          label={t("c.activeTasks")}
          value={data.tasks.filter((x) => x.status !== "done").length}
        />
        <Metric
          label={t("c.unassigned")}
          value={
            data.tasks.filter((x) => !x.assignee_id && x.status !== "done")
              .length
          }
        />
      </div>
      {inviteUrl && (
        <div className="pm-card collab-invite-result">
          <strong>{t("c.invitationReady")}</strong>
          <p>{t("c.invitationHelp")}</p>
          <div className="pm-actions">
            <input
              aria-label={t("c.invitationLink")}
              readOnly
              value={inviteUrl}
            />
            <button
              className="pm-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
              {t(copied ? "c.copied" : "c.copy")}
            </button>
          </div>
        </div>
      )}
      <div className="collab-team-grid">
        {members.map((member) => {
          const assigned = data.tasks.filter(
            (task) => task.assignee_id === member.user_id,
          );
          const open = assigned.filter((task) => task.status !== "done").length;
          return (
            <article className="pm-card collab-member" key={member.id}>
              <div className="pm-row">
                <span className="collab-avatar">
                  {member.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="pm-status">{t("c." + member.role)}</span>
              </div>
              <h2>{member.name}</h2>
              <p>{member.email}</p>
              <div className="collab-workload">
                <span>
                  {open} {t("c.activeTasks")}
                </span>
                <div className="pm-progress-track">
                  <div style={{ width: Math.min(100, open * 10) + "%" }} />
                </div>
                <small>
                  {assigned.filter((task) => task.status === "done").length}{" "}
                  {t("c.completedTasks")}
                </small>
              </div>
              {manage &&
                member.role !== "owner" &&
                member.user_id !== data.project.current_user_id && (
                  <button
                    className="pm-button pm-small"
                    onClick={() => setEditing(member)}
                  >
                    {t("c.manageAccess")}
                  </button>
                )}
            </article>
          );
        })}
      </div>
      {manage && invitations.length > 0 && (
        <div className="pm-card collab-section">
          <h2>{t("c.invitations")}</h2>
          {invitations.map((invite) => (
            <div className="collab-list-row" key={invite.id}>
              <div>
                <strong>{invite.email}</strong>
                <small>
                  {t("c." + invite.role)} · {t("c." + invite.status)} ·{" "}
                  {invite.expires_at.slice(0, 10)}
                </small>
              </div>
              {invite.status === "pending" && (
                <button
                  className="pm-button pm-small"
                  disabled={busy}
                  onClick={() =>
                    void actions.save(
                      "invitations",
                      { status: "revoked" },
                      invite,
                    )
                  }
                >
                  {t("c.revoke")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {editing !== undefined && (
        <CoordinationForm
          title={t(editing ? "c.manageAccess" : "c.invite")}
          onClose={() => setEditing(undefined)}
          onDelete={
            editing ? () => actions.remove("members", editing) : undefined
          }
          onSubmit={async (values) => {
            if (editing) return actions.save("members", values, editing);
            return mutate(async () => {
              const result = await requestJson<{ invitation_url: string }>(
                "/api/v1/projects/" + data.project.id + "/invitations",
                { method: "POST", body: JSON.stringify(values) },
              );
              setInviteUrl(result.invitation_url);
              setCopied(false);
            });
          }}
        >
          {!editing && (
            <Field label={t("c.email")}>
              <input name="email" type="email" required />
            </Field>
          )}
          <Field label={t("c.role")}>
            <select name="role" defaultValue={editing?.role ?? "collaborator"}>
              {["architect", "collaborator", "client"].map((role) => (
                <option key={role} value={role}>
                  {t("c." + role)}
                </option>
              ))}
            </select>
          </Field>
          <p className="pm-muted">{t("c.rolesHelp")}</p>
        </CoordinationForm>
      )}
    </div>
  );
}

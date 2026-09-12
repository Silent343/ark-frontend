"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Plus } from "lucide-react";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import {
  CoordinationHeading,
  CoordinationForm,
  useProjectActions,
} from "@/composition/presentation/coordination-ui";
import { Field, Empty } from "@/composition/presentation/workspace-ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
/** Discussions retain a project/task/document/semantic-element reference and explicit visibility. */
export function CommentsScreen() {
  const { data } = useWorkspace(),
    { t, locale } = useI18n(),
    params = useSearchParams(),
    actions = useProjectActions();
  const [creating, setCreating] = useState(!!params.get("element_id")),
    [target, setTarget] = useState(
      params.get("element_id") ? "element" : "project",
    ),
    [filter, setFilter] = useState("");
  if (!data) return null;
  const client = data.project.role === "client",
    rows = data.coordination.comments.filter(
      (c) => !filter || c.target_type === filter,
    );
  return (
    <div>
      <CoordinationHeading
        title={t("c.comments")}
        description={t("c.commentsHelp")}
        actions={
          <button
            className="pm-button pm-primary"
            onClick={() => setCreating(true)}
          >
            <Plus size={16} />
            {t("c.newComment")}
          </button>
        }
      />
      <div className="pm-toolbar">
        <select
          aria-label={t("c.target")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">{t("c.allDiscussions")}</option>
          {["project", "task", "document", "element"].map((k) => (
            <option key={k} value={k}>
              {t("c." + k)}
            </option>
          ))}
        </select>
      </div>
      {!rows.length ? (
        <Empty title={t("c.noComments")} description={t("c.commentsHelp")} />
      ) : (
        <div className="collab-discussions">
          {[...rows].reverse().map((comment) => (
            <article key={comment.id} className="pm-card collab-comment">
              <div className="pm-row">
                <span>
                  <strong>{comment.author_name}</strong>
                  <small>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(comment.created_at))}
                  </small>
                </span>
                <span className="pm-status">
                  {t("c." + comment.visibility)}
                </span>
              </div>
              <p>{comment.content}</p>
              <div className="pm-actions">
                <MessageSquare size={15} />
                <span>{t("c." + comment.target_type)}</span>
                {comment.target_type === "element" && (
                  <Link
                    href={
                      "/projects/" +
                      data.project.id +
                      "/editor?element_id=" +
                      encodeURIComponent(comment.target_id)
                    }
                  >
                    {comment.target_id}
                  </Link>
                )}
                {comment.target_type === "task" && (
                  <Link href={"/projects/" + data.project.id + "/tasks"}>
                    {data.tasks.find((x) => x.id === comment.target_id)
                      ?.title ?? comment.target_id}
                  </Link>
                )}
                {comment.target_type === "document" && (
                  <Link href={"/projects/" + data.project.id + "/documents"}>
                    {data.documents.find((x) => x.id === comment.target_id)
                      ?.title ?? comment.target_id}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {creating && (
        <CoordinationForm
          title={t("c.newComment")}
          onClose={() => setCreating(false)}
          onSubmit={(v) =>
            actions.save("comments", {
              ...v,
              target_type: target,
              target_id: v.target_id ?? data.project.id,
              visibility: client ? "client" : v.visibility,
            })
          }
        >
          <Field label={t("c.target")}>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {[
                "project",
                ...(!client ? ["task"] : []),
                "document",
                "element",
              ].map((k) => (
                <option key={k} value={k}>
                  {t("c." + k)}
                </option>
              ))}
            </select>
          </Field>
          {target === "task" || target === "document" ? (
            <Field label={t("c.reference")}>
              <select name="target_id" required>
                {(target === "task" ? data.tasks : data.documents).map(
                  (item) => (
                    <option value={item.id} key={item.id}>
                      {item.title}
                    </option>
                  ),
                )}
              </select>
            </Field>
          ) : target === "element" ? (
            <Field label={t("pm.field.element_id")}>
              <input
                name="target_id"
                required
                defaultValue={params.get("element_id") ?? ""}
              />
            </Field>
          ) : null}
          <Field label={t("c.message")}>
            <textarea name="content" required maxLength={2000} rows={5} />
          </Field>
          {!client && (
            <Field label={t("c.visibility")}>
              <select name="visibility" defaultValue="team">
                <option value="team">{t("c.teamOnly")}</option>
                <option value="client">{t("c.sharedWithClient")}</option>
              </select>
            </Field>
          )}
        </CoordinationForm>
      )}
    </div>
  );
}

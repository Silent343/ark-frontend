"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Plus, Check, MessageSquare, Box, Eye } from "lucide-react";
import type { Approval } from "../index";
import {
  useWorkspace,
  workspaceServices,
} from "@/composition/presentation/workspace-context";
import { ResourceDialog } from "@/composition/presentation/resource-dialog";
import {
  Dialog,
  Field,
  Status,
  Empty,
  Metric,
} from "@/composition/presentation/workspace-ui";
import { DocumentPreview } from "@/bounded-contexts/document-management/presentation";
import type { ProjectDocument } from "@/bounded-contexts/document-management";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import { useAuth } from "@/bounded-contexts/identity-access/presentation/auth-provider";
import { canManage } from "@/bounded-contexts/identity-access";
/** Reviews use the signed-in author; clients receive only explicitly assigned review records. */
export function ApprovalsScreen() {
  const { data, mutate, busy, error } = useWorkspace(),
    { t } = useI18n(),
    { user } = useAuth();
  const [editing, setEditing] = useState<Approval | undefined>();
  const [creating, setCreating] = useState(false),
    [preview, setPreview] = useState<ProjectDocument | null>(null),
    [decision, setDecision] = useState<{
      item: Approval;
      status: "approved" | "changes_requested";
    } | null>(null),
    [feedback, setFeedback] = useState("");
  if (!data) return null;
  const client = data.project.role === "client",
    manage = canManage(data.project.role),
    root = "/projects/" + data.project.id;
  const respond = async (e: FormEvent) => {
    e.preventDefault();
    if (!decision) return;
    if (
      await mutate(() =>
        workspaceServices.approvals.update(data.project.id, decision.item, {
          status: decision.status,
          feedback,
        }),
      )
    )
      setDecision(null);
  };
  return (
    <div>
      <header className="pm-page-heading">
        <div>
          <p className="pm-eyebrow">
            {data.project.client_name || data.project.name}
          </p>
          <h1>{t(client ? "c.clientPortal" : "pm.client")}</h1>
          <p>{t("c.sharedReview")}</p>
        </div>
        {manage && (
          <button
            className="pm-button pm-primary"
            onClick={() => setCreating(true)}
          >
            <Plus size={16} />
            {t("pm.newApproval")}
          </button>
        )}
      </header>
      <div className="pm-client-banner">
        <div>
          <h2>{data.project.name}</h2>
          <p>{data.project.location}</p>
        </div>
        <div className="pm-actions">
          <Link className="pm-button" href={root + "/deliverables"}>
            {t("c.deliverables")}
          </Link>
          <Link className="pm-button pm-primary" href={root + "/model"}>
            <Box size={16} />
            {t("pm.exploreModel")}
          </Link>
        </div>
      </div>
      <div className="pm-metrics">
        <Metric
          label={t("pm.pendingApprovals")}
          value={data.approvals.filter((a) => a.status === "pending").length}
        />
        <Metric
          label={t("c.deliverables")}
          value={data.coordination.packages.length}
        />
        <Metric label={t("pm.documents")} value={data.documents.length} />
      </div>
      {!data.approvals.length ? (
        <Empty title={t("pm.noApprovals")} description={t("c.sharedReview")} />
      ) : (
        <div className="pm-review-grid">
          {data.approvals.map((item) => {
            const doc = data.documents.find((d) => d.id === item.document_id),
              canRespond = item.reviewer_id === user.id;
            return (
              <article className="pm-card pm-review-card" key={item.id}>
                <div className="pm-row">
                  <Status value={item.status} />
                  <small>{item.reviewer}</small>
                </div>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
                {doc && (
                  <button
                    className="pm-document-link"
                    onClick={() => setPreview(doc)}
                  >
                    <Eye size={16} />
                    {doc.title} · v{doc.version}
                  </button>
                )}
                {item.feedback && (
                  <blockquote>
                    {item.feedback}
                    <small>
                      {item.reviewer} · {item.decided_at.slice(0, 10)}
                    </small>
                  </blockquote>
                )}
                {item.status === "pending" && canRespond && (
                  <div className="pm-actions">
                    <button
                      className="pm-button pm-primary"
                      onClick={() => {
                        setDecision({ item, status: "approved" });
                        setFeedback("");
                      }}
                    >
                      <Check size={15} />
                      {t("pm.approve")}
                    </button>
                    <button
                      className="pm-button"
                      onClick={() => {
                        setDecision({ item, status: "changes_requested" });
                        setFeedback("");
                      }}
                    >
                      <MessageSquare size={15} />
                      {t("pm.requestChanges")}
                    </button>
                  </div>
                )}
                {manage && item.status === "pending" && (
                  <button
                    className="pm-text-button"
                    onClick={() => {
                      setEditing(item);
                    }}
                  >
                    {t("pm.edit")}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      {(creating || editing) && (
        <ResourceDialog
          resource="approvals"
          item={editing}
          onClose={() => {
            setCreating(false);
            setEditing(undefined);
          }}
        />
      )}
      {preview && (
        <Dialog title={preview.title} onClose={() => setPreview(null)}>
          <DocumentPreview document={preview} />
        </Dialog>
      )}
      {decision && (
        <Dialog
          title={t(
            decision.status === "approved" ? "pm.approve" : "pm.requestChanges",
          )}
          onClose={() => setDecision(null)}
        >
          <form className="pm-form" onSubmit={respond}>
            {error && (
              <p role="alert" className="pm-alert pm-danger">
                {error}
              </p>
            )}
            <p>{decision.item.title}</p>
            <p className="pm-muted">
              {user.name} · {user.email}
            </p>
            <Field label={t("pm.field.feedback")}>
              <textarea
                required
                rows={4}
                maxLength={2000}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </Field>
            <div className="pm-dialog-actions">
              <button
                type="button"
                className="pm-button"
                onClick={() => setDecision(null)}
              >
                {t("pm.cancel")}
              </button>
              <button disabled={busy} className="pm-button pm-primary">
                {t("pm.confirmDecision")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

"use client";
/* eslint-disable @next/next/no-img-element -- Local data URLs represent user-uploaded plan versions. */
import { useState } from "react";
import { VersionOverlay } from "./version-overlay";
import {
  FileText,
  Upload,
  Download,
  GitCompareArrows,
  Eye,
  Plus,
} from "lucide-react";
import type { ProjectDocument } from "../index";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import { ResourceDialog } from "@/composition/presentation/resource-dialog";
import {
  Status,
  Dialog,
  Empty,
  dateLabel,
} from "@/composition/presentation/workspace-ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
/** Renders only validated PDF/image data; original versions stay immutable. */
export function DocumentPreview({ document }: { document: ProjectDocument }) {
  const { t } = useI18n();
  if (!document.file_data)
    return (
      <div className="pm-empty">
        <FileText size={32} />
        <p>{t("pm.exampleDocument")}</p>
      </div>
    );
  return document.mime_type === "application/pdf" ? (
    <object
      className="pm-document-preview"
      data={document.file_data}
      type="application/pdf"
      aria-label={document.title}
    >
      <a href={document.file_data} download={document.file_name}>
        {t("pm.download")}
      </a>
    </object>
  ) : (
    <img
      className="pm-document-preview"
      src={document.file_data}
      alt={document.title}
    />
  );
}
/** Each upload creates a version record, supporting independent review and side-by-side comparison. */
export function DocumentsScreen() {
  const { data } = useWorkspace();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<ProjectDocument | null | undefined>();
  const [previous, setPrevious] = useState<ProjectDocument | undefined>();
  const [preview, setPreview] = useState<ProjectDocument | null>(null);
  const [compare, setCompare] = useState(false);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [query, setQuery] = useState("");
  if (!data) return null;
  const canEdit = data.project.role !== "client";
  const rows = data.documents
    .filter((d) => d.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const leftDoc =
    data.documents.find((d) => d.id === left) ?? data.documents[0];
  const rightDoc =
    data.documents.find((d) => d.id === right) ??
    data.documents[1] ??
    data.documents[0];
  return (
    <div>
      <header className="pm-page-heading">
        <div>
          <p className="pm-eyebrow">{t("pm.delivery")}</p>
          <h1>{t("pm.documents")}</h1>
          <p>{t("pm.documentsHelp")}</p>
        </div>
        <div className="pm-actions">
          <button
            className="pm-button"
            disabled={data.documents.length < 2}
            onClick={() => setCompare(true)}
          >
            <GitCompareArrows size={16} />
            {t("pm.compare")}
          </button>
          <button
            className="pm-button pm-primary"
            hidden={!canEdit}
            onClick={() => {
              setPrevious(undefined);
              setEditing(null);
            }}
          >
            <Upload size={16} />
            {t("pm.upload")}
          </button>
        </div>
      </header>
      <div className="pm-toolbar">
        <input
          aria-label={t("pm.search")}
          placeholder={t("pm.searchDocuments")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="pm-muted">{t("pm.versionHelp")}</span>
      </div>
      {!rows.length ? (
        <Empty
          title={t("pm.noDocuments")}
          description={t("pm.documentsHelp")}
        />
      ) : (
        <div className="pm-card pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                {["title", "discipline", "version", "status"].map((k) => (
                  <th key={k}>{t("pm.field." + k)}</th>
                ))}
                <th>{t("pm.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <button
                      className="pm-text-button"
                      onClick={() => {
                        setPrevious(undefined);
                        if (canEdit) setEditing(doc);
                        else setPreview(doc);
                      }}
                    >
                      {doc.title}
                    </button>
                    <small>
                      {doc.file_name} ·{" "}
                      {dateLabel(doc.created_at.slice(0, 10), locale)}
                    </small>
                  </td>
                  <td>{t("pm.status." + doc.discipline, doc.discipline)}</td>
                  <td>
                    <span className="pm-version">v{doc.version}</span>
                  </td>
                  <td>
                    <Status value={doc.status} />
                  </td>
                  <td>
                    <div className="pm-actions">
                      <button
                        className="pm-icon-button"
                        title={t("pm.preview")}
                        aria-label={t("pm.preview") + " " + doc.title}
                        onClick={() => setPreview(doc)}
                      >
                        <Eye size={17} />
                      </button>
                      {doc.file_data && (
                        <a
                          className="pm-icon-button"
                          href={doc.file_data}
                          download={doc.file_name}
                          title={t("pm.download")}
                          aria-label={t("pm.download") + " " + doc.title}
                        >
                          <Download size={17} />
                        </a>
                      )}
                      <button
                        className="pm-button pm-small"
                        hidden={!canEdit}
                        disabled={data.documents.some(
                          (d) => d.previous_version_id === doc.id,
                        )}
                        onClick={() => {
                          setPrevious(doc);
                          setEditing(null);
                        }}
                      >
                        <Plus size={13} />
                        {t("pm.newVersion")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing !== undefined && (
        <ResourceDialog
          resource="documents"
          item={editing ?? undefined}
          initial={
            previous
              ? {
                  title: previous.title,
                  discipline: previous.discipline,
                  previous_version_id: previous.id,
                  version: previous.version + 1,
                }
              : undefined
          }
          onClose={() => setEditing(undefined)}
        />
      )}
      {preview && (
        <Dialog
          title={preview.title + " · v" + preview.version}
          onClose={() => setPreview(null)}
        >
          <DocumentPreview document={preview} />
        </Dialog>
      )}
      {compare && (
        <Dialog title={t("pm.compare")} onClose={() => setCompare(false)}>
          <p className="pm-muted">{t("pm.compareHelp")}</p>
          <VersionOverlay left={leftDoc} right={rightDoc}/>
          <div className="pm-compare">
            {[
              { doc: leftDoc, value: left, set: setLeft },
              { doc: rightDoc, value: right, set: setRight },
            ].map((side, i) => (
              <div key={i}>
                <select
                  aria-label={t(i ? "pm.rightVersion" : "pm.leftVersion")}
                  value={side.value || side.doc?.id}
                  onChange={(e) => side.set(e.target.value)}
                >
                  {data.documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title} · v{doc.version}
                    </option>
                  ))}
                </select>
                {side.doc && <DocumentPreview document={side.doc} />}
              </div>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}

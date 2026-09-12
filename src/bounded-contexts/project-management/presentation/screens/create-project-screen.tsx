"use client";

import { useState, type FormEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  FileText,
  LoaderCircle,
  UploadCloud,
  X,
} from "lucide-react";
import type { CreateProjectInput } from "@/bounded-contexts/project-management/domain/entities/project";
import { documents } from "@/bounded-contexts/document-management/public";
import { createProjectWorkspace } from "@/composition/application/create-project-workspace";
import { Field } from "@/composition/presentation/workspace-ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";

const initialForm: CreateProjectInput = {
  name: "",
  location: "Lima, Perú",
  floors: 1,
  floorHeight: 2.8,
  structureType: "Reinforced concrete",
  soilType: "Dense sand",
};
const structureOptions = [
  "Reinforced concrete",
  "Confined masonry",
  "Steel frame",
  "Dual system",
];
const soilOptions = ["Dense sand", "Stiff soil", "Gravel", "Soft clay"];

/** Reads the optional source before creating a project, so file errors cannot create empty duplicates. */
function readSource(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Source file could not be read."));
    reader.readAsDataURL(file);
  });
}

/** Accessible intake: management starts immediately; source upload is optional and explicitly non-AI. */
export function CreateProjectScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const update = (field: keyof CreateProjectInput, value: string | number) =>
    setForm((current) => ({ ...current, [field]: value }));
  const selectFile = (selected?: File) => {
    if (!selected || busy) return;
    if (
      !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(
        selected.type,
      ) ||
      selected.size > 3 * 1024 * 1024
    ) {
      setError(t("pm.fileError"));
      return;
    }
    setError("");
    setFile(selected);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files[0]);
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const fileData = file ? await readSource(file) : "";
      // Preserve the created ID if a later upload fails; a retry must not create another project.
      const project = createdProjectId
        ? { id: createdProjectId }
        : await createProjectWorkspace.execute(form);
      setCreatedProjectId(project.id);
      if (file)
        await documents.create(project.id, {
          title: file.name,
          discipline: "architecture",
          version: 1,
          status: "draft",
          file_name: file.name,
          file_data: fileData,
          mime_type: file.type,
          notes: "Original project source.",
          previous_version_id: "",
        });
      router.push(`/projects/${project.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("pm.create.failed"),
      );
      setBusy(false);
    }
  };
  return (
    <div className="pm-workspace">
      <Link className="pm-back-link" href="/projects">
        <ArrowLeft size={15} />
        {t("pm.portfolio")}
      </Link>
      <header className="pm-page-heading">
        <div>
          <p className="pm-eyebrow">{t("pm.newProject")}</p>
          <h1>{t("pm.create.title")}</h1>
          <p>{t("pm.create.description")}</p>
        </div>
      </header>
      <form onSubmit={create}>
        {error && (
          <p className="pm-alert pm-danger" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={busy} className="pm-create-layout">
          <div className="pm-card pm-create-card">
            <div className="pm-row">
              <h2>{t("pm.create.details")}</h2>
              <Building2 size={23} />
            </div>
            <div className="pm-form-grid">
              <Field label={t("pm.field.name")}>
                <input
                  required
                  maxLength={200}
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder={t("pm.create.namePlaceholder")}
                />
              </Field>
              <Field label={t("pm.field.location")}>
                <input
                  required
                  maxLength={200}
                  value={form.location}
                  onChange={(e) => update("location", e.target.value)}
                />
              </Field>
              <Field label={t("pm.create.floors")}>
                <input
                  required
                  type="number"
                  min={1}
                  max={40}
                  step={1}
                  value={form.floors}
                  onChange={(e) => update("floors", Number(e.target.value))}
                />
              </Field>
              <Field label={t("pm.create.height")}>
                <input
                  required
                  type="number"
                  min={2}
                  max={6}
                  step={0.1}
                  value={form.floorHeight}
                  onChange={(e) =>
                    update("floorHeight", Number(e.target.value))
                  }
                />
              </Field>
              <Field label={t("pm.create.structure")}>
                <select
                  value={form.structureType}
                  onChange={(e) => update("structureType", e.target.value)}
                >
                  {structureOptions.map((value, index) => (
                    <option key={value} value={value}>
                      {t("pm.create.structure" + index)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("pm.create.soil")}>
                <select
                  value={form.soilType}
                  onChange={(e) => update("soilType", e.target.value)}
                >
                  {soilOptions.map((value, index) => (
                    <option key={value} value={value}>
                      {t("pm.create.soil" + index)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="pm-footnote">{t("pm.create.after")}</p>
          </div>
          <div className="pm-card pm-create-card">
            <h2>{t("pm.create.source")}</h2>
            <p className="pm-muted">{t("pm.create.optional")}</p>
            <div
              className={
                "pm-upload-zone" + (dragging ? " pm-upload-active" : "")
              }
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
            >
              {file ? (
                <>
                  <FileText size={34} />
                  <strong>{file.name}</strong>
                  <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
                  <button
                    type="button"
                    className="pm-button pm-small"
                    onClick={() => setFile(null)}
                  >
                    <X size={14} />
                    {t("pm.create.remove")}
                  </button>
                </>
              ) : (
                <>
                  <UploadCloud size={34} />
                  <strong>{t("pm.create.drop")}</strong>
                  <small>{t("pm.fileHelp")}</small>
                  <label className="pm-button">
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => selectFile(e.target.files?.[0])}
                    />
                    {t("pm.create.browse")}
                  </label>
                </>
              )}
            </div>
            <p className="pm-footnote">{t("pm.create.demo")}</p>
            <button
              type="submit"
              className="pm-button pm-primary pm-create-submit"
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <ArrowRight size={17} />
              )}{" "}
              {t(busy ? "pm.create.creating" : "pm.create.submit")}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

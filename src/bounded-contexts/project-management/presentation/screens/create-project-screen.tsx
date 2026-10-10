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
import { ProjectCoverField } from "../components/project-cover-field";
import { planDigitization } from "@/bounded-contexts/plan-digitization/public";
import { loadCadPlanSource } from "@/bounded-contexts/plan-digitization/infrastructure/browser-cad-source";
import {
  createCadPlan,
  compileCadBlueprint,
} from "@/bounded-contexts/plan-digitization/domain/cad-operations";

const initialForm: CreateProjectInput = {
  name: "",
  location: "Lima, Perú",
  floors: 1,
  basements: 0,
  floorHeight: 2.8,
  structureType: "Reinforced concrete",
  soilType: "Dense sand",
  coverImage: "",
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
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedKeys, setUploadedKeys] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const update = (field: keyof CreateProjectInput, value: string | number) =>
    setForm((current) => ({ ...current, [field]: value }));
  const selectFiles = (selected: FileList | File[]) => {
    if (busy || selected.length === 0) return;
    const incoming = Array.from(selected);
    const cadFiles = [...files, ...incoming].filter((file) =>
      /\.(dwg|dxf)$/i.test(file.name),
    );
    if (cadFiles.length > 1) {
      setError(
        "Carga un archivo CAD principal por proyecto. Puede contener varias plantas y láminas.",
      );
      return;
    }
    if (
      files.length + incoming.length > 12 ||
      incoming.some((file) =>
        /\.(dwg|dxf)$/i.test(file.name)
          ? file.size > 12 * 1024 * 1024
          : ![
              "image/png",
              "image/jpeg",
              "image/webp",
              "application/pdf",
            ].includes(file.type) || file.size > 3 * 1024 * 1024,
      )
    ) {
      setError(t("pm.fileError"));
      return;
    }
    setError("");
    setFiles((current) => [...current, ...incoming]);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    selectFiles(event.dataTransfer.files);
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      // Preserve the created ID if a later upload fails; a retry must not create another project.
      const project = createdProjectId
        ? { id: createdProjectId }
        : await createProjectWorkspace.execute(form);
      setCreatedProjectId(project.id);
      const uploaded = new Set(uploadedKeys);
      for (const file of files) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (uploaded.has(key)) continue;
        if (/\.(dwg|dxf)$/i.test(file.name)) {
          const source = await loadCadPlanSource(file);
          try {
            if (!source.cad) throw new Error("No se pudo leer el CAD.");
            const base = await planDigitization.getBlueprint.execute(
              project.id,
            );
            const cad = createCadPlan(
              file.name,
              source.cad.entities,
              source.cad.layers,
              source.cad.skipped,
              form.floorHeight,
            );
            await planDigitization.saveBlueprint.execute(
              compileCadBlueprint(base, cad, form.floorHeight),
            );
          } finally {
            source.cad?.dispose();
          }
          uploaded.add(key);
          setUploadedKeys([...uploaded]);
          continue;
        }
        const fileData = await readSource(file);
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
        uploaded.add(key);
        setUploadedKeys([...uploaded]);
      }
      router.push(
        files.length
          ? `/projects/${project.id}/editor?mode=edit${files.some((file) => /\.(dwg|dxf)$/i.test(file.name)) ? "" : "&import=1"}`
          : `/projects/${project.id}`,
      );
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
              <Field label={t("pm.create.basements")}>
                <input
                  required
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  value={form.basements ?? 0}
                  onChange={(e) => update("basements", Number(e.target.value))}
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
            <ProjectCoverField
              value={form.coverImage ?? ""}
              disabled={busy}
              onChange={(value) => update("coverImage", value)}
            />
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
              {files.length ? (
                <>
                  <FileText size={34} />
                  <strong>{files.length} planos seleccionados</strong>
                  <ul className="w-full space-y-1 text-left">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1 text-xs"
                      >
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          aria-label={`Quitar ${file.name}`}
                          onClick={() =>
                            setFiles((current) =>
                              current.filter(
                                (_, position) => position !== index,
                              ),
                            )
                          }
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <UploadCloud size={34} />
                  <strong>{t("pm.create.drop")}</strong>
                  <small>
                    DWG / DXF hasta 12 MB · PDF o imagen hasta 3 MB · hasta 12
                    archivos
                  </small>
                </>
              )}
              <label className="pm-button">
                <input
                  type="file"
                  className="sr-only"
                  multiple
                  accept=".dwg,.dxf,.pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    if (e.target.files) selectFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                {files.length ? "Agregar más planos" : t("pm.create.browse")}
              </label>
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

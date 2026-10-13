"use client";

import { useState, type FormEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  LoaderCircle,
  UploadCloud,
  X,
} from "lucide-react";
import type { CreateProjectInput } from "../../domain/entities/project";
import { documents } from "@/bounded-contexts/document-management/public";
import { createProjectWorkspace } from "@/composition/application/create-project-workspace";
import { Field } from "@/composition/presentation/workspace-ui";
import { ProjectCoverField } from "../components/project-cover-field";
import { planDigitization } from "@/bounded-contexts/plan-digitization/public";
import { loadCadPlanSource } from "@/bounded-contexts/plan-digitization/infrastructure/browser-cad-source";
import { createCadPlan } from "@/bounded-contexts/plan-digitization/domain/cad-operations";
import { compileCadModel } from "@/bounded-contexts/plan-digitization/infrastructure/compile-cad-model";

type IntakeFile = { file: File; discipline: string; view: string };
const fileKey = (file: File) =>
  `${file.name}:${file.size}:${file.lastModified}`;
const isCad = (file: File) => /\.(dwg|dxf)$/i.test(file.name);
const viewLabels: Record<string, string> = {
  plan: "Planta",
  section: "Corte",
  elevation: "Elevación",
  schedule: "Cuadro / detalle",
  other: "Referencia",
};
const purposes = [
  {
    id: "visualization",
    label: "Explorar en 3D",
    detail: "Entender espacios y preparar una presentación.",
  },
  {
    id: "coordination",
    label: "Revisar el proyecto",
    detail: "Comparar planos, niveles y disciplinas.",
  },
  {
    id: "bim-preparation",
    label: "Preparar información BIM",
    detail: "Organizar elementos y datos para una entrega.",
  },
] as const;
const initialForm: CreateProjectInput = {
  name: "",
  location: "",
  floors: 1,
  basements: 0,
  floorHeight: 2.8,
  structureType: "Por definir",
  soilType: "Por definir",
  coverImage: "",
  intent: "visualization",
};
function readSource(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

/** Project details are progressive; dimensional evidence belongs to each imported view. */
export function CreateProjectScreen() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [files, setFiles] = useState<IntakeFile[]>([]);
  const [uploadedKeys, setUploadedKeys] = useState<string[]>([]);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const update = (field: keyof CreateProjectInput, value: string) =>
    setForm((p) => ({ ...p, [field]: value }));
  const selectFiles = (selected: FileList | File[]) => {
    if (busy) return;
    const known = new Set(files.map((f) => fileKey(f.file)));
    const incoming = Array.from(selected).filter((f) => {
      const key = fileKey(f);
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });
    if ([...files.map((f) => f.file), ...incoming].filter(isCad).length > 1) {
      setError(
        "Elige un CAD editable principal. Puedes acompañarlo de plantas, cortes y detalles en PDF o imagen.",
      );
      return;
    }
    if (files.length + incoming.length > 12) {
      setError(
        "Puedes agregar hasta 12 archivos. Agrupa las láminas relacionadas en un PDF.",
      );
      return;
    }
    const invalid = incoming.find(
      (f) =>
        !f.size ||
        (isCad(f)
          ? f.size > 12 * 1024 * 1024
          : ![
              "image/png",
              "image/jpeg",
              "image/webp",
              "application/pdf",
            ].includes(f.type) || f.size > 3 * 1024 * 1024),
    );
    if (invalid) {
      setError(
        `${invalid.name}: usa un DWG/DXF de hasta 12 MB o un PDF, PNG, JPG o WebP de hasta 3 MB.`,
      );
      return;
    }
    setError("");
    setFiles((p) => [
      ...p,
      ...incoming.map((file) => ({
        file,
        discipline: "architecture",
        view: "plan",
      })),
    ]);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    selectFiles(event.dataTransfer.files);
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!form.name.trim()) {
      setError("Escribe un nombre para el proyecto.");
      return;
    }
    setBusy(true);
    setError("");
    let source: Awaited<ReturnType<typeof loadCadPlanSource>> | undefined;
    try {
      const cadFile = files.find(
        (f) => isCad(f.file) && !uploadedKeys.includes(fileKey(f.file)),
      );
      if (cadFile) {
        setStatus("Comprobando el archivo CAD…");
        source = await loadCadPlanSource(cadFile.file);
        if (!source.cad)
          throw new Error(
            "No se pudo interpretar el CAD. Revisa el formato del archivo.",
          );
      }
      setStatus("Creando el espacio de trabajo…");
      const project = createdProjectId
        ? { id: createdProjectId }
        : await createProjectWorkspace.execute(
            {
              ...form,
              name: form.name.trim(),
              location: form.location.trim() || "Por definir",
            },
            setCreatedProjectId,
          );
      setCreatedProjectId(project.id);
      if (createdProjectId && !workspaceReady) {
        await createProjectWorkspace.initialize(project.id, form);
      }
      setWorkspaceReady(true);
      const uploaded = new Set(uploadedKeys);
      for (const item of files) {
        const { file } = item,
          key = fileKey(file);
        if (uploaded.has(key)) continue;
        setStatus(`Preparando ${file.name}…`);
        if (isCad(file)) {
          const base = await planDigitization.getBlueprint.execute(project.id);
          const cad = createCadPlan(
            file.name,
            source!.cad!.entities,
            source!.cad!.layers,
            source!.cad!.skipped,
          );
          await planDigitization.saveBlueprint.execute(
            await compileCadModel(base, cad, 2.8),
          );
        } else {
          await documents.create(project.id, {
            title: file.name,
            discipline: item.discipline,
            version: 1,
            status: "draft",
            file_name: file.name,
            file_data: await readSource(file),
            mime_type: file.type,
            notes: `Vista: ${viewLabels[item.view] ?? item.view}. Fuente del proyecto; pendiente de revisión.`,
            previous_version_id: "",
          });
        }
        uploaded.add(key);
        setUploadedKeys([...uploaded]);
      }
      router.push(
        files.length
          ? `/projects/${project.id}/editor?mode=edit${files.some((f) => isCad(f.file)) ? "&panel=levels" : "&import=1"}`
          : `/projects/${project.id}`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo crear el proyecto.",
      );
      setBusy(false);
      setStatus("");
    } finally {
      source?.cad?.dispose();
    }
  };
  return (
    <div className="pm-workspace project-intake">
      <Link className="pm-back-link" href="/projects">
        <ArrowLeft size={15} />
        Proyectos
      </Link>
      <header className="pm-page-heading">
        <div>
          <p className="pm-eyebrow">NUEVO PROYECTO</p>
          <h1>Del plano al espacio</h1>
          <p>
            Crea el proyecto y organiza sus documentos. Revisarás las medidas y
            los niveles al importar cada plano.
          </p>
        </div>
      </header>
      <div className="intake-journey" aria-label="Proceso del proyecto">
        <span className="is-current">
          <b>1</b>Proyecto y documentos
        </span>
        <span>
          <b>2</b>Escala y plantas
        </span>
        <span>
          <b>3</b>Revisión 2D y 3D
        </span>
      </div>
      <form onSubmit={create}>
        {error && (
          <p className="pm-alert pm-danger" role="alert">
            {error}
            {createdProjectId &&
              " Tu espacio ya está creado; reintenta para continuar con los archivos pendientes."}
          </p>
        )}
        <fieldset disabled={busy} className="pm-create-layout">
          <section className="pm-card pm-create-card intake-project-card">
            <h2>Tu proyecto</h2>
            <p className="pm-footnote">
              Solo necesitas un nombre para comenzar.
            </p>
            <div className="pm-form-grid">
              <Field label="Nombre del proyecto *">
                <input
                  autoComplete="off"
                  required
                  maxLength={200}
                  disabled={!!createdProjectId}
                  value={form.name}
                  placeholder="Ej. Edificio Las Acacias"
                  onChange={(e) => update("name", e.target.value)}
                />
              </Field>
              <Field label="Ubicación · opcional">
                <input
                  maxLength={200}
                  disabled={!!createdProjectId}
                  value={form.location}
                  placeholder="Ciudad, país"
                  onChange={(e) => update("location", e.target.value)}
                />
              </Field>
            </div>
            <fieldset className="intake-purpose" disabled={!!createdProjectId}>
              <legend>¿Para qué usarás el proyecto?</legend>
              {purposes.map((p) => (
                <label
                  className={form.intent === p.id ? "is-selected" : ""}
                  key={p.id}
                >
                  <input
                    type="radio"
                    name="intent"
                    value={p.id}
                    checked={form.intent === p.id}
                    onChange={() => update("intent", p.id)}
                  />
                  <span>
                    <strong>{p.label}</strong>
                    <small>{p.detail}</small>
                  </span>
                  {form.intent === p.id && <Check size={16} />}
                </label>
              ))}
            </fieldset>
            <details className="pm-intake-advanced">
              <summary>Personalizar la portada</summary>
              <ProjectCoverField
                value={form.coverImage ?? ""}
                disabled={busy || !!createdProjectId}
                onChange={(v) => update("coverImage", v)}
              />
            </details>
            <div className="intake-context-note">
              <strong>Las medidas se definen en el plano</strong>
              <p>
                Podrás confirmar unidades, cotas, alturas y sótanos por planta.
                Si tienes cortes, elevaciones o cuadros de puertas y ventanas,
                agrégalos como referencia.
              </p>
            </div>
          </section>
          <section className="pm-card pm-create-card intake-documents-card">
            <div className="pm-row">
              <h2>Documentos del proyecto</h2>
              <span className="intake-optional">Opcional</span>
            </div>
            <p className="pm-footnote">
              Comienza con un plano o crea el espacio para cargarlo después.
            </p>
            <div
              className={
                "pm-upload-zone intake-upload" +
                (dragging ? " pm-upload-active" : "")
              }
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
            >
              <UploadCloud size={30} />
              <strong>Arrastra tus planos aquí</strong>
              <small>DWG / DXF · PDF · PNG / JPG / WebP</small>
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
                Elegir archivos
              </label>
            </div>
            {!!files.length && (
              <div className="intake-files">
                {files.map((item, index) => (
                  <div className="intake-file" key={fileKey(item.file)}>
                    <div className="intake-file-title">
                      <FileText size={18} />
                      <span>
                        <strong>{item.file.name}</strong>
                        <small>
                          {(item.file.size / 1024 / 1024).toFixed(1)} MB ·{" "}
                          {isCad(item.file)
                            ? "CAD editable principal"
                            : "Documento de referencia"}
                        </small>
                      </span>
                      <button
                        type="button"
                        aria-label={`Quitar ${item.file.name}`}
                        disabled={uploadedKeys.includes(fileKey(item.file))}
                        onClick={() =>
                          setFiles((p) => p.filter((_, i) => i !== index))
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                    {!isCad(item.file) && (
                      <div className="intake-file-options">
                        <label>
                          Disciplina
                          <select
                            value={item.discipline}
                            disabled={uploadedKeys.includes(fileKey(item.file))}
                            onChange={(e) =>
                              setFiles((p) =>
                                p.map((f, i) =>
                                  i === index
                                    ? { ...f, discipline: e.target.value }
                                    : f,
                                ),
                              )
                            }
                          >
                            <option value="architecture">Arquitectura</option>
                            <option value="structure">Estructura</option>
                            <option value="electrical">Electricidad</option>
                            <option value="plumbing">Agua y desagüe</option>
                          </select>
                        </label>
                        <label>
                          Contenido
                          <select
                            value={item.view}
                            disabled={uploadedKeys.includes(fileKey(item.file))}
                            onChange={(e) =>
                              setFiles((p) =>
                                p.map((f, i) =>
                                  i === index
                                    ? { ...f, view: e.target.value }
                                    : f,
                                ),
                              )
                            }
                          >
                            <option value="plan">Planta</option>
                            <option value="section">Corte</option>
                            <option value="elevation">Elevación</option>
                            <option value="schedule">Cuadro / detalle</option>
                            <option value="other">Referencia</option>
                          </select>
                        </label>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <details className="intake-format-help">
              <summary>Cómo preparar los archivos</summary>
              <p>
                Un CAD principal de hasta 12 MB, con varias plantas si las
                contiene. Hasta 12 archivos en total; PDF e imágenes de hasta 3
                MB cada uno.
              </p>
              <p>
                Para analizar una imagen, usa una planta legible vista desde
                arriba y una medida real conocida. Los cortes, elevaciones y
                cuadros se guardan como referencias; su contenido se revisa
                antes de incorporarlo al modelo.
              </p>
            </details>
            <button
              className="pm-button pm-primary pm-create-submit"
              type="submit"
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <ArrowRight size={17} />
              )}{" "}
              {busy
                ? "Preparando proyecto…"
                : files.length
                  ? "Crear y revisar planos"
                  : "Crear proyecto"}
            </button>
            <p className="intake-submit-note" role="status" aria-live="polite">
              {busy
                ? status
                : files.length
                  ? "Siguiente: confirmar escala, plantas y elementos en el editor."
                  : "Podrás agregar documentos desde tu espacio de trabajo."}
            </p>
          </section>
        </fieldset>
      </form>
    </div>
  );
}

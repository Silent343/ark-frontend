"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type InputHTMLAttributes,
} from "react";
import {
  Box,
  Download,
  Expand,
  Hand,
  MousePointer2,
  RotateCw,
  ScanLine,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import type { Blueprint } from "../../domain/entities/blueprint";
import type {
  CadBounds,
  CadEntity,
  CadPlan,
  CadRole,
} from "../../domain/entities/cad-plan";
import {
  cadEntityBounds,
  cadRoleLabels,
  createCadPlan,
  detectCadRegions,
  moveCadEntity,
  transformCadEntity,
} from "../../domain/cad-operations";
import { loadCadPlanSource } from "../../infrastructure/browser-cad-source";
import { exportCadDwg } from "../../infrastructure/export-cad";
import { compileCadModel } from "../../infrastructure/compile-cad-model";
import { exportCadImage } from "../../infrastructure/cad-canvas-renderer";
import { CadPlanCanvas } from "./cad-plan-canvas";
import { useBlueprintSave } from "../use-blueprint-save";
import { DrawingCorrespondencePanel } from "./drawing-correspondence-panel";
import { NeuralCadPanel } from "./neural-cad-panel";
import { PlanImportDialog, type SourceDocument } from "./plan-import-dialog";
import {
  drawingViewLabels,
  type DrawingView,
} from "../../domain/drawing-coordination";

/** Commit complete numeric values, so typing a minus sign or decimal never moves geometry prematurely. */
function CadNumberInput({
  value,
  onCommit,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number;
  onCommit: (value: number) => void;
}) {
  return (
    <input
      {...props}
      key={value}
      type="number"
      step="any"
      defaultValue={value}
      onBlur={(event) => {
        const input = event.currentTarget;
        const next = Number(input.value);
        if (
          input.value !== "" &&
          input.validity.valid &&
          Number.isFinite(next)
        ) {
          if (next !== value) onCommit(next);
        } else input.value = String(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

interface Props {
  documents?: SourceDocument[];
  blueprint: Blueprint;
  projectName: string;
  floorHeight: number;
  editMode: boolean;
  members: Array<{ id: string; name: string; email: string }>;
}

/** CAD editing has its own full-size viewport. The semantic model is rebuilt from the same saved entities. */
export function CadEditor({
  blueprint,
  projectName,
  floorHeight,
  editMode,
  members,
  documents = [],
}: Props) {
  const params = useSearchParams();
  const initialSource = blueprint.cad!.entities.find(
    (e) => e.id === params.get("source"),
  );
  const initialBounds = initialSource
    ? cadEntityBounds(initialSource)
    : undefined;
  const [plan, setPlan] = useState<CadPlan>(blueprint.cad!);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSource?.id ?? null,
  );
  const [tool, setTool] = useState<"select" | "pan" | "region">("select");
  const [panel, setPanel] = useState<
    "properties" | "layers" | "levels" | "coordination" | "recognition"
  >(
    params.get("panel") === "recognition"
      ? "recognition"
      : params.get("panel") === "coordination"
        ? "coordination"
        : params.get("panel") === "levels"
          ? "levels"
          : params.get("panel") === "layers"
            ? "layers"
            : "properties",
  );
  const [scope, setScope] = useState(
    blueprint.cad!.regions.find((r) => r.id === params.get("region"))?.id ?? "",
  );
  const [fitKey, setFitKey] = useState(0);
  const [focusBounds, setFocusBounds] = useState<CadBounds | undefined>(() => {
    if (!initialBounds) return undefined;
    const pad =
      Math.max(
        initialBounds.maxX - initialBounds.minX,
        initialBounds.maxY - initialBounds.minY,
        1 / blueprint.cad!.metersPerCadUnit,
      ) * 0.8;
    return {
      minX: initialBounds.minX - pad,
      minY: initialBounds.minY - pad,
      maxX: initialBounds.maxX + pad,
      maxY: initialBounds.maxY + pad,
    };
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<CadPlan[]>([]);
  const save = useBlueprintSave(),
    changed = useRef(false),
    moving = useRef(false);
  const router = useRouter();
  const { commit, draft } = save;
  const base = useRef(blueprint),
    current = useRef(plan);
  const [savedModel, setSavedModel] = useState(blueprint);
  const [referenceOpen, setReferenceOpen] = useState(false);
  async function saveEvidence(next: Blueprint) {
    if (dirty || save.status !== "saved")
      throw new Error("Espera a que se guarde el plano.");
    await commit(next);
    base.current = next;
    setSavedModel(next);
  }
  useEffect(() => {
    current.current = plan;
  }, [plan]);
  const selected = plan.entities.find((e) => e.id === selectedId);
  const bounds = selected ? cadEntityBounds(selected) : null;
  const region = plan.regions.find((r) => r.id === scope);
  const root = `/projects/${blueprint.projectId}`;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!dirty && save.status === "saved") return;
    event.preventDefault();
    try {
      const snapshot = current.current;
      const next = await compileCadModel(base.current, snapshot, floorHeight);
      if (current.current !== snapshot)
        throw new Error(
          "El plano cambió durante la reconstrucción. Espera a que se guarde y vuelve a abrir el modelo.",
        );
      await commit(next);
      changed.current = false;
      setDirty(false);
      router.push(href);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  function remember() {
    setHistory((h) => [...h.slice(-14), current.current]);
  }
  function editRegion(id: string, patch: Partial<CadPlan["regions"][number]>) {
    remember();
    update({
      ...plan,
      regions: plan.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  }
  const proposedHeight = (id: string) => {
    const entries = plan.regions
      .filter((r) => r.enabled && (!r.viewType || r.viewType === "plan"))
      .flatMap((region) =>
        Array.from({ length: region.repeat }, (_, floor) => ({
          id: region.id,
          floor,
          elevation:
            region.elevations?.[floor] ??
            region.elevation + floor * floorHeight,
        })),
      )
      .sort((a, b) => a.elevation - b.elevation);
    const index = entries.findIndex((e) => e.id === id && e.floor === 0);
    const gap =
      index >= 0 && entries[index + 1]
        ? entries[index + 1].elevation - entries[index].elevation
        : 0;
    return gap > 0 ? gap : floorHeight;
  };
  function update(next: CadPlan) {
    changed.current = true;
    setDirty(true);
    const ids = new Set(next.regions.map((r) => r.id));
    setPlan(
      next.neural
        ? { ...next, neural: next.neural.filter((a) => ids.has(a.regionId)) }
        : next,
    );
  }
  // Save after a gesture or settled form edit, never serialize the full drawing on every pointer pixel.
  useEffect(() => {
    if (!changed.current || moving.current) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void compileCadModel(base.current, plan, floorHeight, controller.signal)
        .then(async (next) => {
          if (controller.signal.aborted || current.current !== plan) return;
          draft(next);
          await commit(next);
          base.current = next;
          setSavedModel(next);
          if (current.current === plan) {
            changed.current = false;
            setDirty(false);
            if (next.cad) {
              current.current = next.cad;
              setPlan(next.cad);
            }
          }
        })
        .catch((error: Error) => {
          if (error.name !== "AbortError") setMessage(error.message);
        });
    }, 900);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [plan, floorHeight, commit, draft]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input,textarea,select"))
        return;
      if (event.key === "Escape") {
        setSelectedId(null);
        setTool("select");
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        remember();
        update({
          ...current.current,
          entities: current.current.entities.filter((e) => e.id !== selectedId),
        });
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selectedId]);
  function editEntity(patch: Partial<CadEntity>) {
    if (!selected) return;
    if (patch.role !== undefined) patch = { ...patch, roleSource: "manual" };
    remember();
    update({
      ...plan,
      entities: plan.entities.map((e) =>
        e.id === selected.id ? ({ ...e, ...patch } as CadEntity) : e,
      ),
    });
  }
  function position(axis: "x" | "y", value: number) {
    if (!bounds || !selected || !Number.isFinite(value)) return;
    remember();
    const previous = axis === "x" ? bounds.minX : bounds.minY;
    update({
      ...plan,
      entities: plan.entities.map((e) =>
        e.id === selected.id
          ? moveCadEntity(
              e,
              axis === "x" ? value - previous : 0,
              axis === "y" ? value - previous : 0,
            )
          : e,
      ),
    });
  }
  async function download(format: "png" | "jpg" | "dwg") {
    setBusy(true);
    setMessage(`Preparando ${format.toUpperCase()}…`);
    try {
      const blob =
        format === "dwg"
          ? await exportCadDwg(plan)
          : await exportCadImage(plan, format, region ?? plan.bounds);
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `${plan.sourceName.replace(/\.(dwg|dxf)$/i, "")}-editado.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        `${format.toUpperCase()} exportado con las ediciones actuales.`,
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file: File, related: File[] = []) {
    // Replacing an editable drawing is explicit; undo also retains the previous document.
    if (
      !window.confirm(
        "Este archivo reemplazará el CAD actual. ¿Quieres continuar?",
      )
    )
      return;
    setBusy(true);
    setMessage("Leyendo entidades CAD…");
    try {
      const source = await loadCadPlanSource(file, undefined, related);
      try {
        if (!source.cad) throw new Error("Archivo CAD no válido.");
        const next = createCadPlan(
          file.name,
          source.cad.entities,
          source.cad.layers,
          source.cad.skipped,
          floorHeight,
        );
        remember();
        update(next);
        setScope("");
        setSelectedId(null);
        setMessage(
          `${next.entities.length.toLocaleString()} entidades cargadas.`,
        );
      } finally {
        source.cad?.dispose();
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function addRegion(b: CadBounds) {
    remember();
    const elevation =
      Math.max(
        -floorHeight,
        ...plan.regions.map((r) => r.elevation + (r.repeat - 1) * floorHeight),
      ) + floorHeight;
    const item = {
      ...b,
      id: `region-${crypto.randomUUID()}`,
      name: `Planta ${plan.regions.length + 1}`,
      enabled: true,
      elevation,
      repeat: 1,
    };
    update({ ...plan, regions: [...plan.regions, item] });
    setScope(item.id);
    setTool("select");
    setPanel("levels");
  }
  const toolbar = (
    <>
      <select
        aria-label="Vista del plano CAD"
        value={scope}
        onChange={(e) => {
          setScope(e.target.value);
          setFocusBounds(undefined);
          setFitKey((k) => k + 1);
        }}
      >
        <option value="">Lámina completa</option>
        {plan.regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <button
        className="pm-button"
        onClick={() => {
          setFocusBounds(undefined);
          setFitKey((k) => k + 1);
        }}
        title="Ajustar vista"
      >
        <Expand size={15} />
        Ajustar
      </button>
      <details className="cad-download">
        <summary className="pm-button">
          <Download size={15} />
          Descargar
        </summary>
        <div>
          {(["png", "jpg", "dwg"] as const).map((f) => (
            <button key={f} disabled={busy} onClick={() => void download(f)}>
              {f.toUpperCase()}
              {f === "dwg" ? " · entidades editadas" : " · vista seleccionada"}
            </button>
          ))}
        </div>
      </details>
    </>
  );
  if (!editMode)
    return (
      <div className="cad-preview-screen">
        <header className="cad-page-heading">
          <div>
            <span className="pm-eyebrow">DISEÑO · {projectName}</span>
            <h1>Plano 2D</h1>
            <p>
              {plan.sourceName} · {plan.entities.length.toLocaleString()}{" "}
              entidades CAD editables
            </p>
          </div>
          <Link
            className="pm-button pm-primary"
            href={root + "/editor?mode=edit"}
          >
            <Expand size={15} />
            Abrir editor
          </Link>
        </header>
        <div className="cad-preview-layout">
          <section className="cad-preview-drawing">
            <div className="cad-toolbar">{toolbar}</div>
            <div className="cad-preview-canvas">
              <CadPlanCanvas plan={plan} fitBounds={region} fitKey={fitKey} />
            </div>
          </section>
          <aside className="cad-preview-info">
            <h2>Participantes del proyecto</h2>
            {members.map((m) => (
              <div className="cad-member" key={m.id}>
                <span>
                  {m.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")}
                </span>
                <div>
                  <strong>{m.name}</strong>
                  <small>{m.email}</small>
                </div>
              </div>
            ))}
            <h2>Modelo conectado</h2>
            <p>
              {savedModel.walls.length} segmentos de muro ·{" "}
              {savedModel.doors.length} puertas · {savedModel.windows.length}{" "}
              ventanas
            </p>
            <p>
              {savedModel.levels.length} niveles propuestos a partir de los
              títulos de las plantas.
            </p>
            <Link className="pm-button" href={root + "/model"}>
              <Box size={15} />
              Ver modelo 3D
            </Link>
          </aside>
        </div>
        {message && <p role="status">{message}</p>}
      </div>
    );
  return (
    <div className="workspace-focus-surface cad-editor-shell">
      <header className="cad-editor-header">
        <div>
          <strong>{projectName}</strong>
          <small>{plan.sourceName}</small>
        </div>
        <span className="cad-save-state" role="status">
          {save.status === "saved"
            ? dirty
              ? "Cambios pendientes"
              : "Guardado"
            : save.status === "saving"
              ? "Guardando…"
              : (save.error ?? "Cambios pendientes")}
        </span>
        {save.status === "error" && (
          <button
            className="pm-button"
            onClick={() => {
              const next = save.latestDraft.current;
              void save
                .retry()
                .then(() => {
                  if (next) {
                    base.current = next;
                    setSavedModel(next);
                  }
                })
                .catch((error) => setMessage((error as Error).message));
            }}
          >
            Reintentar
          </button>
        )}
        <Link
          className="pm-button"
          href={root + "/model"}
          onClick={(e) => void navigate(e, root + "/model")}
        >
          <Box size={15} />
          Estudio 3D
        </Link>
        <Link
          className="pm-button"
          href={root + "/editor"}
          onClick={(e) => void navigate(e, root + "/editor")}
        >
          <X size={15} />
          Salir
        </Link>
      </header>
      <div className="cad-toolbar">
        <div className="cad-tool-group">
          <button
            title="Seleccionar y mover"
            aria-pressed={tool === "select"}
            onClick={() => setTool("select")}
          >
            <MousePointer2 size={18} />
          </button>
          <button
            title="Desplazar plano"
            aria-pressed={tool === "pan"}
            onClick={() => setTool("pan")}
          >
            <Hand size={18} />
          </button>
          <button
            title="Delimitar una vista"
            aria-pressed={tool === "region"}
            onClick={() => setTool("region")}
          >
            <ScanLine size={18} />
          </button>
          <button
            title="Deshacer"
            disabled={!history.length}
            onClick={() => {
              const previous = history.at(-1);
              if (previous) {
                update(previous);
                setHistory((h) => h.slice(0, -1));
              }
            }}
          >
            <Undo2 size={18} />
          </button>
        </div>
        {toolbar}
        <label className="pm-button cad-upload">
          <Upload size={15} />
          Reemplazar CAD
          <input
            type="file"
            accept=".dwg,.dxf"
            multiple
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void importFile(
                  file,
                  Array.from(e.target.files ?? []).slice(1),
                );
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="cad-editor-body">
        <div className="cad-editor-drawing">
          <CadPlanCanvas
            plan={plan}
            selectedId={selectedId}
            editable
            pan={tool === "pan"}
            regionMode={tool === "region"}
            onRegionSelected={addRegion}
            fitBounds={focusBounds ?? region}
            fitKey={fitKey}
            onSelect={(id) => {
              setSelectedId(id);
              setPanel("properties");
            }}
            onMove={(id, dx, dy) => {
              if (!moving.current) {
                remember();
                moving.current = true;
              }
              changed.current = true;
              setDirty(true);
              setPlan((p) => ({
                ...p,
                entities: p.entities.map((e) =>
                  e.id === id ? moveCadEntity(e, dx, dy) : e,
                ),
              }));
            }}
            onMoveEnd={() => {
              moving.current = false;
              setPlan((p) => ({ ...p }));
            }}
          />
          <div className="cad-canvas-hint">
            {tool === "region"
              ? "Arrastra un rectángulo para delimitar una vista; después clasifícala"
              : "Rueda: zoom · Arrastra el fondo: desplazar · Clic: seleccionar · Supr: eliminar"}
          </div>
        </div>
        <aside className="cad-inspector">
          <div className="cad-inspector-tabs">
            {(
              [
                "properties",
                "layers",
                "levels",
                "coordination",
                "recognition",
              ] as const
            ).map((p) => (
              <button
                key={p}
                aria-pressed={panel === p}
                onClick={() => setPanel(p)}
              >
                {
                  {
                    properties: "Elemento",
                    layers: "Capas",
                    levels: "Vistas",
                    coordination: "Vincular",
                    recognition: "IA",
                  }[p]
                }
              </button>
            ))}
          </div>
          <div className="cad-inspector-content">
            <label>
              Buscar texto
              <input
                type="search"
                aria-label="Buscar texto en el CAD"
                placeholder="Escribe y pulsa Enter"
                onKeyDown={(event) => {
                  if (
                    event.key !== "Enter" ||
                    !event.currentTarget.value.trim()
                  )
                    return;
                  const query = event.currentTarget.value.trim().toLowerCase();
                  const entity = plan.entities.find(
                    (e) =>
                      e.kind === "text" &&
                      e.value.toLowerCase().includes(query),
                  );
                  if (entity) {
                    const b = cadEntityBounds(entity);
                    setSelectedId(entity.id);
                    setPanel("properties");
                    setFocusBounds({
                      minX: b.minX - 1,
                      minY: b.minY - 1,
                      maxX: b.maxX + 1,
                      maxY: b.maxY + 1,
                    });
                    setFitKey((k) => k + 1);
                  } else setMessage("No se encontró ese texto.");
                }}
              />
            </label>
          </div>
          {panel === "properties" &&
            (selected && bounds ? (
              <div className="cad-inspector-content">
                <h2>
                  {selected.kind === "text"
                    ? "Texto"
                    : selected.kind === "circle"
                      ? "Círculo"
                      : "Línea / polilínea"}
                </h2>
                <small>{selected.id}</small>
                {selected.kind === "text" && (
                  <>
                    <label>
                      Contenido
                      <textarea
                        aria-label="Contenido del texto CAD"
                        value={selected.value}
                        maxLength={200}
                        onChange={(e) => editEntity({ value: e.target.value })}
                      />
                    </label>
                    <label>
                      Altura del texto
                      <CadNumberInput
                        step=".01"
                        min=".001"
                        value={selected.height}
                        onCommit={(height) => {
                          editEntity({ height });
                        }}
                      />
                    </label>
                  </>
                )}
                <label>
                  Capa
                  <select
                    value={selected.layer}
                    onChange={(e) => editEntity({ layer: e.target.value })}
                  >
                    {plan.layers.map((l) => (
                      <option key={l.name}>{l.name}</option>
                    ))}
                  </select>
                </label>
                <div className="cad-field-pair">
                  {(["x", "y"] as const).map((axis) => (
                    <label key={axis}>
                      Posición {axis.toUpperCase()}
                      <CadNumberInput
                        step=".01"
                        value={Number(
                          (axis === "x" ? bounds.minX : bounds.minY).toFixed(4),
                        )}
                        onCommit={(value) => position(axis, value)}
                      />
                    </label>
                  ))}
                </div>
                <div className="cad-field-pair">
                  <label>
                    Girar (°)
                    <input
                      aria-label="Girar entidad CAD"
                      type="number"
                      defaultValue={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          remember();
                          update({
                            ...plan,
                            entities: plan.entities.map((v) =>
                              v.id === selectedId
                                ? transformCadEntity(
                                    v,
                                    Number(e.currentTarget.value),
                                    1,
                                  )
                                : v,
                            ),
                          });
                          e.currentTarget.value = "0";
                        }
                      }}
                    />
                  </label>
                  <label>
                    Escala
                    <input
                      aria-label="Escala entidad CAD"
                      type="number"
                      min=".01"
                      step=".1"
                      defaultValue={1}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          Number(e.currentTarget.value) > 0
                        ) {
                          remember();
                          update({
                            ...plan,
                            entities: plan.entities.map((v) =>
                              v.id === selectedId
                                ? transformCadEntity(
                                    v,
                                    0,
                                    Number(e.currentTarget.value),
                                  )
                                : v,
                            ),
                          });
                          e.currentTarget.value = "1";
                        }
                      }}
                    />
                  </label>
                </div>
                <small>Enter para aplicar el giro o la escala.</small>
                {selected.kind === "path" && (
                  <>
                    <h3>Vértices</h3>
                    {Array.from(
                      { length: Math.min(32, selected.points.length / 2) },
                      (_, i) => (
                        <div className="cad-field-pair" key={i}>
                          {[0, 1].map((axis) => (
                            <label key={axis}>
                              {i + 1} · {axis ? "Y" : "X"}
                              <CadNumberInput
                                step=".01"
                                value={Number(
                                  selected.points[i * 2 + axis].toFixed(4),
                                )}
                                onCommit={(value) =>
                                  editEntity({
                                    points: selected.points.map((n, j) =>
                                      j === i * 2 + axis ? value : n,
                                    ),
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                      ),
                    )}
                  </>
                )}
                {selected.kind === "circle" && (
                  <label>
                    Radio
                    <CadNumberInput
                      min=".001"
                      step=".01"
                      value={selected.radius}
                      onCommit={(radius) => {
                        editEntity({ radius });
                      }}
                    />
                  </label>
                )}
                <button
                  className="pm-button pm-danger"
                  onClick={() => {
                    remember();
                    update({
                      ...plan,
                      entities: plan.entities.filter(
                        (e) => e.id !== selectedId,
                      ),
                    });
                    setSelectedId(null);
                  }}
                >
                  <Trash2 size={15} />
                  Eliminar elemento
                </button>
              </div>
            ) : (
              <div className="cad-inspector-empty">
                <MousePointer2 size={27} />
                <h2>Selecciona un elemento</h2>
                <p>
                  Haz clic en una línea, símbolo o texto del plano. Puedes
                  moverlo, cambiar sus medidas y editar su contenido.
                </p>
                <button
                  className="pm-button"
                  onClick={() => {
                    const entity = plan.entities.find(
                      (e) =>
                        e.kind === "text" &&
                        (!region ||
                          (() => {
                            const b = cadEntityBounds(e);
                            return (
                              b.minX >= region.minX &&
                              b.maxX <= region.maxX &&
                              b.minY >= region.minY &&
                              b.maxY <= region.maxY
                            );
                          })()),
                    );
                    if (entity) setSelectedId(entity.id);
                  }}
                >
                  <Type size={15} />
                  Seleccionar un texto
                </button>
              </div>
            ))}
          {panel === "layers" && (
            <div className="cad-inspector-content">
              <h2>Capas del dibujo</h2>
              <p>
                La función asignada a cada capa determina cómo se interpreta en
                3D.
              </p>
              <details className="cad-note">
                <summary>Alcance de la importación y exportación</summary>
                <p>
                  El DWG descargado contiene la geometría y los textos
                  editables. Los bloques se descomponen y las curvas se
                  aproximan con segmentos; no es una copia íntegra de los
                  objetos originales.
                </p>
                {Object.keys(plan.skipped).length > 0 && (
                  <p>
                    Objetos no incorporados:{" "}
                    {Object.entries(plan.skipped)
                      .map(([name, count]) => `${name}: ${count}`)
                      .join(" · ")}
                    .
                  </p>
                )}
              </details>
              {plan.layers.map((l) => (
                <div className="cad-layer-row" key={l.name}>
                  <label>
                    <input
                      type="checkbox"
                      checked={l.visible}
                      onChange={(e) => {
                        remember();
                        update({
                          ...plan,
                          layers: plan.layers.map((v) =>
                            v.name === l.name
                              ? { ...v, visible: e.target.checked }
                              : v,
                          ),
                        });
                      }}
                    />
                    <span>
                      {l.name}
                      <small>{l.count.toLocaleString()} entidades</small>
                    </span>
                  </label>
                  <select
                    aria-label={`Función 3D ${l.name}`}
                    value={l.role}
                    onChange={(e) => {
                      remember();
                      update({
                        ...plan,
                        layers: plan.layers.map((v) =>
                          v.name === l.name
                            ? {
                                ...v,
                                role: e.target.value as CadRole,
                                inferred: false,
                                reviewed: true,
                              }
                            : v,
                        ),
                        entities: plan.entities.map((entity) =>
                          entity.layer === l.name
                            ? { ...entity, role: undefined }
                            : entity,
                        ),
                      });
                    }}
                  >
                    {Object.entries(cadRoleLabels).map(([role, label]) => (
                      <option value={role} key={role}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          {panel === "levels" && (
            <div className="cad-inspector-content">
              <h2>Plantas y unidades</h2>
              <label>
                Unidad del dibujo
                <select
                  value={plan.metersPerCadUnit}
                  onChange={(e) => {
                    remember();
                    update({
                      ...plan,
                      metersPerCadUnit: Number(e.target.value),
                      unitConfirmed: true,
                    });
                  }}
                >
                  <option value={1}>Metros</option>
                  <option value={0.01}>Centímetros</option>
                  <option value={0.001}>Milímetros</option>
                  <option value={0.3048}>Pies</option>
                </select>
              </label>
              <label className="cad-inline-check">
                <input
                  type="checkbox"
                  checked={plan.unitConfirmed}
                  onChange={(e) => {
                    remember();
                    update({ ...plan, unitConfirmed: e.target.checked });
                  }}
                />
                He comprobado la unidad del dibujo
              </label>
              {!plan.unitConfirmed && (
                <p className="cad-note">
                  Confirma la unidad antes de utilizar las medidas del modelo.
                </p>
              )}
              {savedModel.review?.warnings.includes("cad-awaiting-units") && (
                <p className="cad-note">
                  Primero delimita cada planta, confirma las unidades y marca
                  «Incluir planta en 3D» solo en las vistas que quieras
                  construir. No se reconstruye toda la lámina automáticamente.
                </p>
              )}
              <button
                className="pm-button"
                onClick={() => {
                  remember();
                  update({
                    ...plan,
                    regions: detectCadRegions(plan, floorHeight),
                  });
                }}
              >
                <RotateCw size={14} />
                Detectar plantas
              </button>
              <button className="pm-button" onClick={() => setTool("region")}>
                <ScanLine size={14} />
                Delimitar vista
              </button>
              {plan.regions.map((r) => (
                <div className="cad-region-card" key={r.id}>
                  <label>
                    Tipo de vista
                    <select
                      value={r.viewType ?? "plan"}
                      onChange={(e) =>
                        editRegion(r.id, {
                          viewType: e.target.value as DrawingView,
                        })
                      }
                    >
                      {Object.entries(drawingViewLabels).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                    {r.viewType && r.viewType !== "plan" && (
                      <small>
                        Esta vista aporta evidencia; sus líneas no se extruyen
                        como muros.
                      </small>
                    )}
                  </label>
                  <label className="cad-inline-check">
                    <input
                      type="checkbox"
                      disabled={!!r.viewType && r.viewType !== "plan"}
                      checked={r.enabled}
                      onChange={(e) => {
                        remember();
                        update({
                          ...plan,
                          regions: plan.regions.map((v) =>
                            v.id === r.id
                              ? { ...v, enabled: e.target.checked }
                              : v,
                          ),
                        });
                      }}
                    />
                    Incluir planta en 3D
                  </label>
                  <label>
                    Nombre
                    <input
                      value={r.name}
                      onChange={(e) => {
                        remember();
                        update({
                          ...plan,
                          regions: plan.regions.map((v) =>
                            v.id === r.id ? { ...v, name: e.target.value } : v,
                          ),
                        });
                      }}
                    />
                  </label>
                  <div className="cad-field-pair">
                    <label>
                      Elevación (m)
                      <CadNumberInput
                        min={-1000}
                        max={1000}
                        value={r.elevation}
                        onCommit={(elevation) =>
                          editRegion(r.id, {
                            elevation,
                            elevations: undefined,
                            elevationSource: "manual",
                          })
                        }
                      />
                    </label>
                    <label>
                      Repetir niveles
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={r.repeat}
                        onChange={(e) => {
                          remember();
                          update({
                            ...plan,
                            regions: plan.regions.map((v) =>
                              v.id === r.id
                                ? {
                                    ...v,
                                    repeat: Math.max(
                                      1,
                                      Math.min(20, Number(e.target.value)),
                                    ),
                                  }
                                : v,
                            ),
                          });
                        }}
                      />
                    </label>
                  </div>
                  <label>
                    Altura de muros (m)
                    <CadNumberInput
                      min={0.1}
                      max={100}
                      value={r.wallHeight ?? proposedHeight(r.id)}
                      onCommit={(wallHeight) =>
                        editRegion(r.id, { wallHeight })
                      }
                    />
                    <small>
                      {r.wallHeight !== undefined
                        ? "Confirmada manualmente"
                        : "Propuesta desde niveles / altura de referencia"}
                      . Usa un corte o una cota de altura; el desnivel entre
                      pisos no siempre es la altura del muro.
                    </small>
                  </label>
                  {r.wallHeight === undefined ? (
                    <button
                      className="pm-button"
                      onClick={() =>
                        editRegion(r.id, { wallHeight: proposedHeight(r.id) })
                      }
                    >
                      Confirmar {proposedHeight(r.id)} m
                    </button>
                  ) : (
                    <button
                      className="pm-button"
                      onClick={() =>
                        editRegion(r.id, { wallHeight: undefined })
                      }
                    >
                      Volver a altura propuesta
                    </button>
                  )}
                  <details className="cad-registration-controls">
                    <summary>Ajustar alineación entre plantas</summary>
                    <p>
                      Corrección en metros sobre la alineación automática.
                      Utiliza un eje o una columna común como referencia.
                    </p>
                    <div className="cad-field-pair">
                      <label>
                        Corrección X (m)
                        <CadNumberInput
                          min={-100000}
                          max={100000}
                          value={r.alignment?.x ?? 0}
                          onCommit={(x) =>
                            editRegion(r.id, {
                              alignment: { x, y: r.alignment?.y ?? 0 },
                            })
                          }
                        />
                      </label>
                      <label>
                        Corrección Y (m)
                        <CadNumberInput
                          min={-100000}
                          max={100000}
                          value={r.alignment?.y ?? 0}
                          onCommit={(y) =>
                            editRegion(r.id, {
                              alignment: { x: r.alignment?.x ?? 0, y },
                            })
                          }
                        />
                      </label>
                    </div>
                    {r.alignment && (
                      <button
                        className="pm-button"
                        onClick={() =>
                          editRegion(r.id, { alignment: undefined })
                        }
                      >
                        Restablecer alineación automática
                      </button>
                    )}
                  </details>
                  <button
                    className="pm-button"
                    onClick={() => {
                      setScope(r.id);
                      setFocusBounds(undefined);
                      setFitKey((k) => k + 1);
                    }}
                  >
                    Ver esta planta
                  </button>
                  <button
                    className="pm-icon-button"
                    title="Eliminar planta"
                    onClick={() => {
                      remember();
                      update({
                        ...plan,
                        regions: plan.regions.filter((v) => v.id !== r.id),
                        neural: plan.neural?.filter((a) => a.regionId !== r.id),
                      });
                      if (scope === r.id) setScope("");
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {panel === "coordination" && (
            <DrawingCorrespondencePanel
              plan={savedModel}
              initialTargetId={params.get("target") ?? undefined}
              disabled={!editMode || dirty || save.status !== "saved"}
              onSave={saveEvidence}
              onImport={() => setReferenceOpen(true)}
              onFocus={(regionId, textId) => {
                setScope(regionId);
                setSelectedId(textId);
                setFocusBounds(plan.regions.find((r) => r.id === regionId));
                setFitKey((k) => k + 1);
              }}
            />
          )}
          {panel === "recognition" && (
            <NeuralCadPanel
              plan={plan}
              projectId={blueprint.projectId}
              disabled={!editMode || save.status === "conflict"}
              analysisDisabled={dirty || save.status !== "saved"}
              onFocus={(bounds, regionId) => {
                setScope(regionId);
                setSelectedId(null);
                setFocusBounds(bounds);
                setFitKey((k) => k + 1);
              }}
              onBusy={setBusy}
              onUpdate={(next) => {
                if (current.current !== plan)
                  throw new Error(
                    "El CAD cambió durante el análisis; vuelve a analizar la vista actual.",
                  );
                remember();
                update(next);
              }}
            />
          )}
        </aside>
      </div>
      {referenceOpen && (
        <PlanImportDialog
          blueprint={savedModel}
          documents={documents}
          referenceOnly
          onClose={() => setReferenceOpen(false)}
          onSave={saveEvidence}
        />
      )}
      <footer className="cad-editor-footer">
        <span>
          {plan.entities.length.toLocaleString()} entidades ·{" "}
          {plan.layers.length} capas · {plan.regions.length}{" "}
          {plan.regions.length === 1 ? "vista" : "vistas"}
        </span>
        <span role="status">
          {message ||
            (savedModel.review?.warnings.includes("cad-awaiting-units")
              ? "CAD guardado · escala y plantas pendientes"
              : "Edición CAD vinculada al modelo 3D")}
        </span>
      </footer>
    </div>
  );
}

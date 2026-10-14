"use client";
import { useEffect, useRef, useState } from "react";
import type { CadPlan, CadBounds } from "../../domain/entities/cad-plan";
import {
  cadNeuralSignature,
  type CadNeuralAnalysis,
  type NeuralPlanResult,
} from "../../domain/neural-plan";
import {
  NEURAL_CLASS_LABELS,
  type NeuralInstance,
  type NeuralOpeningInstance,
} from "../../domain/neural-contract";
import { neuralTiles, neuralTileView } from "../../application/neural-tiles";
import { drawCad } from "../../infrastructure/cad-canvas-renderer";
import { requestJson } from "@/shared/infrastructure/rest-client";

type ModelCapability = {
  id: string;
  label: string;
  classes: string[];
  available: boolean;
};
type Proposal = Omit<
  CadNeuralAnalysis,
  "regionId" | "sourceSignature" | "applied" | "overlay"
>;
export function NeuralCadPanel({
  plan,
  projectId,
  disabled,
  analysisDisabled,
  onUpdate,
  onBusy,
  onFocus,
}: {
  plan: CadPlan;
  projectId: string;
  disabled?: boolean;
  analysisDisabled?: boolean;
  onUpdate: (plan: CadPlan) => void;
  onBusy?: (busy: boolean) => void;
  onFocus?: (bounds: CadBounds, regionId: string) => void;
}) {
  const [models, setModels] = useState<ModelCapability[]>([]),
    [modelId, setModelId] = useState("openbim-m2-unet");
  const [regionId, setRegionId] = useState(
    plan.regions.find(
      (r) => r.enabled && (!r.viewType || r.viewType === "plan"),
    )?.id ?? "",
  );
  const [metersPerPixel, setMetersPerPixel] = useState(0.025),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null),
    latest = useRef(plan);
  const [visibleObjects, setVisibleObjects] = useState(20);
  useEffect(() => {
    latest.current = plan;
  }, [plan]);
  useEffect(() => () => pending.current?.abort(), []);
  const region = plan.regions.find((r) => r.id === regionId),
    analysis = plan.neural?.find((a) => a.regionId === regionId);
  const current = !!(
    region &&
    analysis &&
    analysis.sourceSignature === cadNeuralSignature(plan, region)
  );
  const model = models.find((m) => m.id === modelId);
  let tileCount = 0,
    tileError = "";
  try {
    if (region && plan.unitConfirmed)
      tileCount = neuralTiles(plan, region, metersPerPixel).length;
  } catch (e) {
    tileError = e instanceof Error ? e.message : "Región no válida";
  }
  useEffect(() => {
    let live = true;
    void requestJson<{ models?: ModelCapability[]; model?: { id: string } }>(
      `/api/v1/projects/${projectId}/plan-detection`,
    )
      .then((status) => {
        if (!live) return;
        setModels(status.models ?? []);
        setModelId(
          status.model?.id ??
            status.models?.find((m) => m.available)?.id ??
            "openbim-m2-unet",
        );
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [projectId]);

  function updateAnalysis(change: (a: CadNeuralAnalysis) => CadNeuralAnalysis) {
    if (busy || disabled || !current) return;
    onUpdate({
      ...plan,
      neural: plan.neural?.map((a) =>
        a.regionId === regionId ? change(a) : a,
      ),
    });
  }
  function updateObject(
    group: "openings" | "fixtures",
    id: string,
    patch: Partial<NeuralOpeningInstance>,
  ) {
    if (
      (patch.heightM !== undefined &&
        (!Number.isFinite(patch.heightM) ||
          patch.heightM <= 0 ||
          patch.heightM > 10)) ||
      (patch.sillM !== undefined &&
        (!Number.isFinite(patch.sillM) || patch.sillM < 0 || patch.sillM > 10))
    ) {
      setError("Introduce una dimensión válida de hasta 10 m.");
      return;
    }
    setError("");
    updateAnalysis((a) => ({
      ...a,
      [group]: a[group]?.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  }
  async function analyze() {
    if (!region || disabled || analysisDisabled || busy || !plan.unitConfirmed)
      return;
    const signature = cadNeuralSignature(plan, region),
      controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    onBusy?.(true);
    setError("");
    const timeout = setTimeout(() => controller.abort(), 20 * 60_000);
    let worker: Worker | undefined,
      sequence = 0;
    try {
      const tiles = neuralTiles(plan, region, metersPerPixel);
      worker = new Worker(
        new URL(
          "../../infrastructure/neural-vector.worker.ts",
          import.meta.url,
        ),
        { type: "module" },
      );
      const call = (payload: Record<string, unknown>) =>
        new Promise<{ data?: Proposal }>((resolve, reject) => {
          const id = ++sequence;
          const abort = () => {
            cleanup();
            reject(
              new Error(
                "Análisis cancelado o fuera del presupuesto de tiempo.",
              ),
            );
          };
          const cleanup = () =>
            controller.signal.removeEventListener("abort", abort);
          if (controller.signal.aborted) {
            abort();
            return;
          }
          controller.signal.addEventListener("abort", abort, { once: true });
          worker!.onmessage = (e) => {
            if (e.data.id !== id) return;
            cleanup();
            if (e.data.error) reject(new Error(e.data.error));
            else resolve(e.data);
          };
          worker!.onerror = (e) => {
            cleanup();
            reject(new Error(e.message));
          };
          worker!.postMessage({ ...payload, id });
        });
      await call({ type: "start", cad: plan, region, metersPerPixel });
      const width = Math.ceil(
        ((region.maxX - region.minX) * plan.metersPerCadUnit) / metersPerPixel,
      );
      const height = Math.ceil(
        ((region.maxY - region.minY) * plan.metersPerCadUnit) / metersPerPixel,
      );
      const thumbnail = document.createElement("canvas"),
        ratio = Math.min(1, 1024 / Math.max(width, height));
      thumbnail.width = Math.ceil(width * ratio);
      thumbnail.height = Math.ceil(height * ratio);
      const preview = thumbnail.getContext("2d");
      if (!preview) throw new Error("Canvas no disponible.");
      preview.fillStyle = "#fffefa";
      preview.fillRect(0, 0, thumbnail.width, thumbnail.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas no disponible.");
      for (const [index, tile] of tiles.entries()) {
        setProgress(`Recorte ${index + 1} de ${tiles.length}`);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 512, 512);
        context.save();
        context.beginPath();
        context.rect(0, 0, tile.width, tile.height);
        context.clip();
        drawCad(
          context,
          plan,
          neuralTileView(plan, region, tile, metersPerPixel),
        );
        context.restore();
        const result = await requestJson<NeuralPlanResult>(
          `/api/v1/projects/${projectId}/plan-detection`,
          {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({
              image: canvas.toDataURL("image/png"),
              modelId,
            }),
          },
        );
        if (result.model.id !== modelId)
          throw new Error(
            "El servidor devolvió un detector distinto al seleccionado.",
          );
        await call({ type: "tile", result, index });
        const bitmap = await createImageBitmap(
          await (await fetch(result.overlay)).blob(),
        );
        preview.drawImage(
          bitmap,
          0,
          0,
          tile.width,
          tile.height,
          tile.x * ratio,
          tile.y * ratio,
          tile.width * ratio,
          tile.height * ratio,
        );
        bitmap.close();
      }
      setProgress("Uniendo zonas y comprobando anfitriones…");
      const { data } = await call({ type: "finish" });
      if (!data) throw new Error("Propuesta neuronal incompleta.");
      const live = latest.current,
        liveRegion = live.regions.find((r) => r.id === regionId);
      if (!liveRegion || cadNeuralSignature(live, liveRegion) !== signature)
        throw new Error(
          "El CAD cambió durante el análisis. Repite la detección.",
        );
      if (controller.signal.aborted) throw new Error("Análisis cancelado.");
      onUpdate({
        ...live,
        neural: [
          ...(live.neural ?? []).filter((a) => a.regionId !== regionId),
          {
            ...data,
            regionId,
            sourceSignature: signature,
            applied: false,
            overlay: thumbnail.toDataURL("image/png"),
          },
        ],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falló el análisis neuronal.");
    } finally {
      clearTimeout(timeout);
      pending.current = null;
      worker?.terminate();
      setBusy(false);
      onBusy?.(false);
      setProgress("");
    }
  }
  function objectRow(
    item: NeuralInstance | NeuralOpeningInstance,
    group: "openings" | "fixtures",
  ) {
    const opening =
      group === "openings" ? (item as NeuralOpeningInstance) : undefined;
    const eligible =
      !!item.heightM &&
      item.kind !== "railing" &&
      (!opening ||
        (opening.hostStatus === "hosted" &&
          (opening.kind !== "window" || opening.sillM !== undefined)));
    const label = `${NEURAL_CLASS_LABELS[item.kind] ?? item.kind} · ${item.id}`;
    return (
      <li key={item.id} className="neural-object-row">
        <div>
          <strong>{NEURAL_CLASS_LABELS[item.kind] ?? item.kind}</strong>
          <small>
            {opening
              ? opening.hostStatus === "hosted"
                ? `Muro ${opening.hostWallIndex! + 1} · ${opening.widthM?.toFixed(2)} m`
                : opening.hostStatus === "ambiguous"
                  ? "Anfitrión ambiguo"
                  : "Sin muro anfitrión"
              : "Huella propuesta · volumen paramétrico"}
          </small>
        </div>
        {onFocus && (
          <button
            type="button"
            className="pm-button"
            disabled={!current || busy}
            onClick={() => {
              const xs = item.polygon.map((p) => p[0]),
                ys = item.polygon.map((p) => p[1]),
                pad = 0.5 / plan.metersPerCadUnit;
              onFocus(
                {
                  minX: Math.min(...xs) - pad,
                  maxX: Math.max(...xs) + pad,
                  minY: Math.min(...ys) - pad,
                  maxY: Math.max(...ys) + pad,
                },
                regionId,
              );
            }}
          >
            Ubicar huella en el plano
          </button>
        )}
        {item.kind === "railing" ? (
          <small>
            Revisión 2D solamente; no se infiere su sistema constructivo.
          </small>
        ) : (
          <>
            <label>
              Altura (m)
              <input
                aria-label={`Altura ${label}`}
                type="number"
                min=".01"
                max="10"
                step=".05"
                value={item.heightM ?? ""}
                disabled={disabled || busy || !current}
                onChange={(e) =>
                  updateObject(group, item.id, {
                    heightM: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                    approved: false,
                  })
                }
              />
            </label>
            {opening?.kind === "window" && (
              <label>
                Antepecho (m)
                <input
                  aria-label={`Antepecho ${label}`}
                  type="number"
                  min="0"
                  max="10"
                  step=".05"
                  value={opening.sillM ?? ""}
                  disabled={disabled || busy || !current}
                  onChange={(e) =>
                    updateObject(group, item.id, {
                      sillM: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                      approved: false,
                    })
                  }
                />
              </label>
            )}
            <label className="drawing-confirm">
              <input
                aria-label={`Aprobar ${label}`}
                type="checkbox"
                checked={item.approved && current}
                disabled={disabled || busy || !current || !eligible}
                onChange={(e) =>
                  updateObject(group, item.id, { approved: e.target.checked })
                }
              />
              Revisado para 3D
            </label>
          </>
        )}
      </li>
    );
  }
  return (
    <section
      className="drawing-coordination-panel"
      aria-label="Reconocimiento neuronal"
    >
      <h2>Reconocimiento neuronal</h2>
      <p>
        Elige un detector y analiza la planta por zonas a escala real. Los
        objetos se proponen para revisión; la red no aporta alturas ni un BIM
        validado.
      </p>
      <label>
        Planta
        <select
          value={regionId}
          disabled={busy || disabled}
          onChange={(e) => setRegionId(e.target.value)}
        >
          {plan.regions
            .filter((r) => !r.viewType || r.viewType === "plan")
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Detector
        <select
          value={modelId}
          disabled={busy || disabled}
          onChange={(e) => setModelId(e.target.value)}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id} disabled={!m.available}>
              {m.label}
              {m.available ? "" : " · no instalado"}
            </option>
          ))}
        </select>
      </label>
      <small>
        {model?.classes
          .filter((c) => c !== "background")
          .map((c) => NEURAL_CLASS_LABELS[c] ?? c)
          .join(" · ")}
      </small>
      <label>
        Detalle de análisis
        <select
          value={metersPerPixel}
          disabled={busy || disabled}
          onChange={(e) => setMetersPerPixel(Number(e.target.value))}
        >
          <option value=".01">1 cm/píxel · fino</option>
          <option value=".025">2,5 cm/píxel · equilibrado</option>
          <option value=".05">5 cm/píxel · planta grande</option>
          <option value=".1">10 cm/píxel · vista general</option>
        </select>
      </label>
      {!plan.unitConfirmed ? (
        <p>Confirma las unidades CAD en «Vistas» antes del análisis.</p>
      ) : tileError ? (
        <p role="alert">{tileError}</p>
      ) : (
        <small>
          {tileCount} recortes de 512 px · solapamiento del 20 %. CPU
          secuencial; sin reducir toda la planta a una miniatura.
        </small>
      )}
      {!models.some((m) => m.available) && (
        <p>No hay detectores instalados en este servidor.</p>
      )}
      <button
        type="button"
        className="pm-button pm-primary"
        disabled={
          disabled ||
          analysisDisabled ||
          busy ||
          !region ||
          !model?.available ||
          !tileCount ||
          !!tileError ||
          !plan.unitConfirmed ||
          ((plan.neural?.length ?? 0) >= 12 && !analysis)
        }
        onClick={() => void analyze()}
      >
        {busy ? progress : "Analizar con IA"}
      </button>
      {busy && (
        <button
          type="button"
          className="pm-button"
          onClick={() => pending.current?.abort()}
        >
          Cancelar análisis
        </button>
      )}
      {analysis && (
        <>
          {/* Local analysis thumbnail, never an external image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="neural-mask-preview"
            src={analysis.overlay}
            alt="Propuesta neuronal por zonas sobre la planta"
          />
          <p>
            {analysis.walls.length} segmentos · {analysis.openings?.length ?? 0}{" "}
            aberturas · {analysis.fixtures?.length ?? 0} objetos ·{" "}
            {(analysis.elapsedMs / 1000).toFixed(1)} s CPU acumulados.
          </p>
          <small>
            Los recortes se solapan: los conteos de píxeles no equivalen a
            cantidades de objetos ni a exactitud.
          </small>
          {!current && (
            <p role="status">
              La fuente CAD cambió. Esta propuesta está desactualizada y no se
              aplica.
            </p>
          )}
          <label className="drawing-confirm">
            <input
              type="checkbox"
              checked={!!analysis.applied && current}
              disabled={
                disabled ||
                busy ||
                !current ||
                !analysis.walls.length ||
                !plan.unitConfirmed
              }
              onChange={(e) =>
                updateAnalysis((a) => ({ ...a, applied: e.target.checked }))
              }
            />
            Usar la propuesta híbrida CAD + IA en el modelo 3D
          </label>
          {!!analysis.openings?.length && (
            <details>
              <summary>Revisar aberturas ({analysis.openings.length})</summary>
              <p>
                Confirma alturas y antepechos. Una abertura sin anfitrión debe
                corregirse en el CAD; no se asigna al muro más cercano a la
                fuerza.
              </p>
              <ul className="neural-object-list">
                {analysis.openings
                  .slice(0, visibleObjects)
                  .map((i) => objectRow(i, "openings"))}
              </ul>
            </details>
          )}
          {!!analysis.fixtures?.length && (
            <details>
              <summary>
                Revisar equipamiento ({analysis.fixtures.length})
              </summary>
              <p>
                Las huellas no describen el objeto completo. Confirma la
                categoría en el plano y su altura antes de aprobar un volumen
                paramétrico.
              </p>
              <ul className="neural-object-list">
                {analysis.fixtures
                  .slice(0, visibleObjects)
                  .map((i) => objectRow(i, "fixtures"))}
              </ul>
            </details>
          )}
          {Math.max(
            analysis.openings?.length ?? 0,
            analysis.fixtures?.length ?? 0,
          ) > visibleObjects && (
            <button
              type="button"
              className="pm-button"
              onClick={() => setVisibleObjects((n) => n + 20)}
            >
              Mostrar 20 propuestas más por categoría
            </button>
          )}
          <small>
            Experimental · {analysis.model.id}. Pesos de investigación; no aptos
            para uso comercial sin revisar su licencia. No detecta
            automáticamente todos los elementos, instalaciones ni estructuras.
          </small>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

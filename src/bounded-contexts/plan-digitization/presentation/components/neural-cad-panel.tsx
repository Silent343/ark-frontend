"use client";
import { useEffect, useRef, useState } from "react";
import type { CadPlan } from "../../domain/entities/cad-plan";
import {
  cadNeuralSignature,
  type CadNeuralAnalysis,
  type NeuralPlanResult,
} from "../../domain/neural-plan";
import { drawCad, fitCadView } from "../../infrastructure/cad-canvas-renderer";
import { requestJson } from "@/shared/infrastructure/rest-client";

export function NeuralCadPanel({
  plan,
  projectId,
  disabled,
  onUpdate,
  onBusy,
}: {
  plan: CadPlan;
  projectId: string;
  disabled?: boolean;
  onUpdate: (plan: CadPlan) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [available, setAvailable] = useState<boolean>();
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const [regionId, setRegionId] = useState(
    plan.regions.find(
      (r) => r.enabled && (!r.viewType || r.viewType === "plan"),
    )?.id ??
      plan.regions.find((r) => !r.viewType || r.viewType === "plan")?.id ??
      "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const region = plan.regions.find((r) => r.id === regionId);
  const analysis = plan.neural?.find((a) => a.regionId === regionId);
  const current =
    region &&
    analysis &&
    analysis.sourceSignature === cadNeuralSignature(plan, region);
  useEffect(() => {
    let live = true;
    void requestJson<{ available: boolean }>(
      `/api/v1/projects/${projectId}/plan-detection`,
    )
      .then((r) => {
        if (live) setAvailable(r.available);
      })
      .catch((e) => {
        if (live) {
          setAvailable(false);
          setError(e.message);
        }
      });
    return () => {
      live = false;
    };
  }, [projectId]);
  async function analyze() {
    if (!region || disabled || busy) return;
    setBusy(true);
    onBusy?.(true);
    setError("");
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 90_000);
    let worker: Worker | undefined;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1024;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas no disponible.");
      const view = fitCadView(region, 1024, 1024, 32);
      drawCad(context, plan, view);
      const result = await requestJson<NeuralPlanResult>(
        `/api/v1/projects/${projectId}/plan-detection`,
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({ image: canvas.toDataURL("image/png") }),
        },
      );
      worker = new Worker(
        new URL(
          "../../infrastructure/neural-vector.worker.ts",
          import.meta.url,
        ),
        { type: "module" },
      );
      const walls = await new Promise<CadNeuralAnalysis["walls"]>(
        (resolve, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => reject(new Error("Análisis cancelado o fuera de tiempo.")),
            { once: true },
          );
          worker!.onmessage = (e) =>
            e.data.error
              ? reject(new Error(e.data.error))
              : resolve(e.data.walls);
          worker!.onerror = (e) => reject(new Error(e.message));
          worker!.postMessage({ cad: plan, region, result, view });
        },
      );
      if (controller.signal.aborted) return;
      onUpdate({
        ...plan,
        neural: [
          ...(plan.neural ?? []).filter((a) => a.regionId !== regionId),
          {
            regionId,
            sourceSignature: cadNeuralSignature(plan, region),
            applied: false,
            model: result.model,
            overlay: result.overlay,
            elapsedMs: result.elapsedMs,
            walls,
            counts: result.counts,
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
    }
  }
  return (
    <section
      className="drawing-coordination-panel"
      aria-label="Reconocimiento neuronal"
    >
      <h2>Reconocimiento neuronal</h2>
      <p>
        Segmentación de muros, puertas y ventanas. Las capas CAD conservan
        mobiliario, columnas y otros elementos que este modelo no clasifica.
      </p>
      <label>
        Planta que se analizará
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
      {!plan.unitConfirmed && (
        <p>
          Confirma las unidades CAD en «Vistas» antes de convertir la máscara a
          medidas reales.
        </p>
      )}
      {available === false && (
        <p>El modelo neuronal no está disponible en este servidor.</p>
      )}
      <button
        type="button"
        className="pm-button pm-primary"
        disabled={
          disabled ||
          busy ||
          !region ||
          !available ||
          ((plan.neural?.length ?? 0) >= 12 && !analysis)
        }
        onClick={() => void analyze()}
      >
        {busy ? "Analizando la planta…" : "Analizar con IA"}
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
          {/* The local analysis image is generated by the same inference job, not a remote asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="neural-mask-preview"
            src={analysis.overlay}
            alt="Máscara neuronal: azul muros, naranja puertas y verde ventanas"
          />
          <small>Azul: muros · naranja: puertas · verde: ventanas</small>
          <p>
            {analysis.walls.length} segmentos propuestos ·{" "}
            {(analysis.elapsedMs / 1000).toFixed(2)} s de inferencia CPU. Esto
            no es una medición de exactitud.
          </p>
          {!current && (
            <p role="status">
              El CAD cambió desde el análisis. La propuesta está desactualizada
              y no se aplica.
            </p>
          )}
          {!analysis.walls.length && (
            <p>
              No se obtuvo una propuesta de muros utilizable. Revisa la vista y
              su resolución.
            </p>
          )}
          <label className="drawing-confirm">
            <input
              type="checkbox"
              checked={!!analysis.applied && !!current}
              disabled={
                disabled ||
                busy ||
                !current ||
                !analysis.walls.length ||
                !plan.unitConfirmed
              }
              onChange={(e) =>
                onUpdate({
                  ...plan,
                  neural: plan.neural!.map((a) =>
                    a.regionId === regionId
                      ? { ...a, applied: e.target.checked }
                      : a,
                  ),
                })
              }
            />
            Usar la propuesta híbrida CAD + IA en el modelo 3D
          </label>
          <small>
            Modelo experimental {analysis.model.id}. Verifica el resultado sobre
            el plano original antes de una entrega profesional.
          </small>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

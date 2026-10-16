"use client";
import { useEffect, useMemo, useState } from "react";
import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import type { CanonicalFloorPlanGraph } from "@/bounded-contexts/plan-digitization/domain/canonical/types";
import { preparationReport } from "@/bounded-contexts/plan-digitization/domain/canonical/preparation";
import { canonicalRenderBlueprint } from "@/bounded-contexts/plan-digitization/domain/canonical/blueprint-adapter";

/** Validate the shared CAD/raster IR off-thread before mounting WebGL. */
export function useCanonicalModel(
  source?: Blueprint,
  correspondenceResults: ReadonlyArray<{ id: string; status: string }> = [],
) {
  const referenceKey = JSON.stringify(
    correspondenceResults
      .filter((r) => r.status === "applied")
      .map((r) => r.id)
      .sort(),
  );
  const initial = useMemo(
    () => (source ? preparationReport(source) : undefined),
    [source],
  );
  const enabled =
    initial?.state === "READY_TO_RECONSTRUCT" ||
    initial?.state === "NEEDS_REVIEW";
  const [result, setResult] = useState<{
    source: Blueprint;
    referenceKey: string;
    graph?: CanonicalFloorPlanGraph;
    blueprint?: Blueprint;
    error?: string;
  }>();
  useEffect(() => {
    if (!source || !enabled) return;
    const worker = new Worker(
      new URL(
        "../../plan-digitization/infrastructure/canonical-model.worker.ts",
        import.meta.url,
      ),
      { type: "module" },
    );
    let live = true;
    const timeout = setTimeout(() => {
      worker.terminate();
      if (live)
        setResult({
          source,
          referenceKey,
          error:
            "La validación superó 60 segundos. Delimita una planta más pequeña.",
        });
    }, 60_000);
    worker.onmessage = (
      event: MessageEvent<{ graph?: CanonicalFloorPlanGraph; error?: string }>,
    ) => {
      try {
        const { graph, error } = event.data;
        if (live)
          setResult({
            source,
            referenceKey,
            graph,
            error,
            blueprint:
              graph && !graph.issues.some((i) => i.severity === "blocking")
                ? canonicalRenderBlueprint(graph, source)
                : undefined,
          });
      } catch (error) {
        if (live)
          setResult({
            source,
            referenceKey,
            error:
              error instanceof Error
                ? error.message
                : "No se pudo preparar el modelo.",
          });
      }
      clearTimeout(timeout);
      worker.terminate();
    };
    worker.onerror = (event) => {
      if (live)
        setResult({
          source,
          referenceKey,
          error: event.message || "No se pudo iniciar la validación.",
        });
      clearTimeout(timeout);
      worker.terminate();
    };
    // Original CAD vertices and raster images are not needed by topology; avoid cloning them again.
    worker.postMessage({
      appliedCorrespondenceIds: JSON.parse(referenceKey) as string[],
      plan: {
        ...source,
        sourceImage: source.sourceImage ? "present" : undefined,
        sheets: source.sheets?.map((s) => ({ ...s, image: "", neural: undefined })),
        floorDetails: undefined,
        cad: source.cad
          ? { ...source.cad, entities: [], layers: [], neural: undefined }
          : undefined,
      },
    });
    return () => {
      live = false;
      clearTimeout(timeout);
      worker.terminate();
    };
  }, [source, enabled, referenceKey]);
  const current =
    result && result.source === source && result.referenceKey === referenceKey
      ? result
      : undefined;
  const report = useMemo(
    () =>
      source
        ? preparationReport(
            source,
            current?.graph,
            current?.error
              ? "failed"
              : enabled && !current
                ? "running"
                : "idle",
          )
        : undefined,
    [source, current, enabled],
  );
  return { ...current, report };
}

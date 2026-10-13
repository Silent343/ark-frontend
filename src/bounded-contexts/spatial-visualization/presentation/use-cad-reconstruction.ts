"use client";
import { useEffect, useMemo, useState } from "react";
import { resolveDrawingCorrespondences } from "@/bounded-contexts/plan-digitization/domain/drawing-coordination";
import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import { compileCadModel } from "@/bounded-contexts/plan-digitization/infrastructure/compile-cad-model";

/** Older CAD previews are upgraded off-thread without silently changing the saved source drawing. */
export function useCadReconstruction(source?: Blueprint) {
  const [result, setResult] = useState<{
    source: Blueprint;
    blueprint?: Blueprint;
    error?: string;
  }>();
  const needsUpgrade =
    !!source?.cad && (source.reconstruction?.version ?? 0) < 6;
  useEffect(() => {
    if (!source?.cad || (source.reconstruction?.version ?? 0) >= 6) return;
    const controller = new AbortController();
    void compileCadModel(source, source.cad, 2.8, controller.signal)
      .then((blueprint) => {
        if (!controller.signal.aborted) setResult({ source, blueprint });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError")
          setResult({ source, error: error.message });
      });
    return () => controller.abort();
  }, [source]);
  const current = result?.source === source ? result : undefined;
  const raw = needsUpgrade ? current?.blueprint : source;
  const resolved = useMemo(
    () => (raw ? resolveDrawingCorrespondences(raw) : undefined),
    [raw],
  );
  return {
    blueprint: resolved?.plan,
    rawBlueprint: raw,
    correspondenceResults: resolved?.results ?? [],
    loading: needsUpgrade && !current,
    error: current?.error,
  };
}

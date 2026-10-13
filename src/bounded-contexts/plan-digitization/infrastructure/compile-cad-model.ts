import type { Blueprint } from "../domain/entities/blueprint";
import type { CadPlan } from "../domain/entities/cad-plan";

/** A cancelled edit terminates its worker; outdated geometry can never overwrite newer input. */
export function compileCadModel(
  base: Blueprint,
  cad: CadPlan,
  height = 2.8,
  signal?: AbortSignal,
): Promise<Blueprint> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const worker = new Worker(
      new URL("./cad-model.worker.ts", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => {
      clearTimeout(timeout);
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "La reconstrucción superó 90 segundos. Confirma las unidades y delimita una sola planta antes de volver a intentarlo.",
        ),
      );
    }, 90_000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (
      event: MessageEvent<{ blueprint?: Blueprint; error?: string }>,
    ) => {
      cleanup();
      if (event.data.blueprint) resolve(event.data.blueprint);
      else
        reject(
          new Error(event.data.error ?? "No se pudo reconstruir el plano."),
        );
    };
    worker.onerror = (event) => {
      cleanup();
      reject(
        new Error(event.message || "No se pudo iniciar la reconstrucción."),
      );
    };
    // CAD is sent once: it may contain hundreds of thousands of vertices.
    worker.postMessage({ base: { ...base, cad: undefined }, cad, height });
  });
}

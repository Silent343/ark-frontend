import type { PlanReview } from "../domain/entities/blueprint";
import type { RasterPlan } from "./browser-plan-source";
import type { CadEntity } from "../domain/entities/cad-plan";
import { cadReferenceName } from "./cad-external-references";

interface CadLayer {
  name: string;
  visible: boolean;
  count: number;
}
interface CadWorkerResponse {
  id: number;
  type: "loaded" | "rendered" | "error" | "references";
  references?: string[];
  message?: string;
  bitmap?: ImageBitmap;
  width?: number;
  height?: number;
  text?: PlanReview["text"];
  layers?: CadLayer[];
  skipped?: Record<string, number>;
  entityCount?: number;
  shapes?: CadEntity[];
}

/** The CAD binary stays in this browser; the worker prevents a large DWG from freezing React. */
export async function loadCadPlanSource(
  file: File,
  signal?: AbortSignal,
  relatedFiles: File[] = [],
): Promise<RasterPlan> {
  const lookup = new Map<string, File>();
  if (
    relatedFiles.length + 1 > 32 ||
    relatedFiles.reduce((n, f) => n + f.size, file.size) > 128 * 1024 * 1024
  )
    throw new Error(
      "Selecciona hasta 32 CAD relacionados, con un total máximo de 128 MB.",
    );
  if ([file, ...relatedFiles].some((f) => f.size > 32 * 1024 * 1024))
    throw new Error("Máximo 32 MB por archivo CAD.");
  for (const related of relatedFiles) {
    const key = cadReferenceName(related.name);
    if (lookup.has(key))
      throw new Error(
        `Hay dos referencias con el mismo nombre: ${related.name}.`,
      );
    lookup.set(key, related);
  }
  const worker = new Worker(new URL("./cad-plan.worker.ts", import.meta.url), {
    type: "module",
  });
  const pending = new Map<
    number,
    {
      resolve: (value: CadWorkerResponse) => void;
      reject: (error: Error) => void;
    }
  >();
  let sequence = 0;
  let disposed = false;
  const fail = (message: string) => {
    for (const request of pending.values()) request.reject(new Error(message));
    pending.clear();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    fail("La vista CAD se cerró.");
    worker.terminate();
  };
  worker.onmessage = (event: MessageEvent<CadWorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) {
      response.bitmap?.close();
      return;
    }
    pending.delete(response.id);
    if (response.type === "error")
      request.reject(new Error(response.message ?? "No se pudo leer el CAD."));
    else request.resolve(response);
  };
  worker.onerror = (event) =>
    fail(event.message || "El lector CAD dejó de responder.");
  signal?.addEventListener("abort", dispose, { once: true });

  const send = (
    message: Record<string, unknown>,
    transfer: Transferable[] = [],
  ) => {
    if (disposed) return Promise.reject(new Error("La vista CAD se cerró."));
    const id = ++sequence;
    return new Promise<CadWorkerResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...message, id }, transfer);
    });
  };
  const toCanvas = (response: CadWorkerResponse) => {
    if (!response.bitmap || !response.width || !response.height)
      throw new Error("El lector CAD no produjo una vista válida.");
    const canvas = document.createElement("canvas");
    canvas.width = response.width;
    canvas.height = response.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D no disponible.");
    context.drawImage(response.bitmap, 0, 0);
    response.bitmap.close();
    return canvas;
  };
  try {
    const bytes = await file.arrayBuffer();
    let response = await send(
      {
        type: "load",
        bytes,
        format: /\.dxf$/i.test(file.name) ? "dxf" : "dwg",
        availableReferences: [...lookup.keys()],
      },
      [bytes],
    );
    for (let depth = 0; response.type === "references"; depth++) {
      if (depth >= 8)
        throw new Error("La cadena de referencias CAD supera ocho niveles.");
      const selected = (response.references ?? []).map((name) =>
        lookup.get(cadReferenceName(name)),
      );
      if (selected.some((f) => !f))
        throw new Error(
          `Faltan referencias CAD: ${(response.references ?? []).join(", ")}. Selecciona la lámina y sus archivos base juntos.`,
        );
      const references = await Promise.all(
        selected.map(async (f) => ({
          name: cadReferenceName(f!.name),
          format: /\.dxf$/i.test(f!.name) ? "dxf" : "dwg",
          bytes: await f!.arrayBuffer(),
        })),
      );
      response = await send(
        { type: "references", references },
        references.map((r) => r.bytes),
      );
    }
    const canvas = toCanvas(response);
    return {
      canvas,
      pageCount: 1,
      text: response.text ?? [],
      cad: {
        entities: response.shapes ?? [],
        layers: response.layers ?? [],
        skipped: response.skipped ?? {},
        entityCount: response.entityCount ?? 0,
        renderLayers: async (visibleLayers: string[]) => {
          const rendered = await send({ type: "render", visibleLayers });
          return { canvas: toCanvas(rendered), text: rendered.text ?? [] };
        },
        dispose,
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

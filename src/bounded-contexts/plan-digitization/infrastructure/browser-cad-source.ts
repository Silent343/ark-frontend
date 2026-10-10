import type { PlanReview } from "../domain/entities/blueprint";
import type { RasterPlan } from "./browser-plan-source";
import type { CadEntity } from "../domain/entities/cad-plan";

interface CadLayer {
  name: string;
  visible: boolean;
  count: number;
}
interface CadWorkerResponse {
  id: number;
  type: "loaded" | "rendered" | "error";
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
): Promise<RasterPlan> {
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
    const response = await send(
      {
        type: "load",
        bytes,
        format: /\.dxf$/i.test(file.name) ? "dxf" : "dwg",
      },
      [bytes],
    );
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

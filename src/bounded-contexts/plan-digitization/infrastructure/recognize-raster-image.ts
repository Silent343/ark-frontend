import { requestJson } from "@/shared/infrastructure/rest-client";
import type { NeuralPlanResult } from "../domain/neural-plan";
import type { RasterNeuralProposal } from "../domain/raster-neural";

/** Neural inference runs on the API; mask vectorization runs off the UI thread. */
export async function recognizeRasterImage(
  canvas: HTMLCanvasElement,
  projectId: string,
  modelId: string,
  signal: AbortSignal,
  symbols = false,
): Promise<RasterNeuralProposal> {
  const result = await requestJson<NeuralPlanResult>(
    `/api/v1/projects/${projectId}/plan-detection`,
    {
      method: "POST",
      signal,
      body: JSON.stringify({
        image: canvas.toDataURL("image/jpeg", 0.9),
        modelId,
        focus: true,
        details: true,
        symbols,
      }),
    },
  );
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (result.model.id !== modelId)
    throw new Error("El modelo recibido es distinto al seleccionado.");
  const geometryCanvas = document.createElement("canvas"),
    factor = Math.min(1, 1024 / Math.max(canvas.width, canvas.height));
  geometryCanvas.width = Math.round(canvas.width * factor);
  geometryCanvas.height = Math.round(canvas.height * factor);
  const geometryContext = geometryCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!geometryContext)
    throw new Error("No se pudo leer la geometría original.");
  geometryContext.fillStyle = "#ffffff";
  geometryContext.fillRect(0, 0, geometryCanvas.width, geometryCanvas.height);
  geometryContext.drawImage(
    canvas,
    0,
    0,
    geometryCanvas.width,
    geometryCanvas.height,
  );
  const rgba = geometryContext.getImageData(
      0,
      0,
      geometryCanvas.width,
      geometryCanvas.height,
    ).data,
    gray = new Uint8Array(geometryCanvas.width * geometryCanvas.height);
  for (let i = 0; i < gray.length; i++)
    gray[i] = Math.round(
      rgba[4 * i] * 0.2126 +
        rgba[4 * i + 1] * 0.7152 +
        rgba[4 * i + 2] * 0.0722,
    );
  const proposal = await new Promise<RasterNeuralProposal>(
    (resolve, reject) => {
      const worker = new Worker(
        new URL("./raster-neural.worker.ts", import.meta.url),
        { type: "module" },
      );
      const cleanup = () => {
        clearTimeout(timer);
        worker.terminate();
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        reject(new DOMException("Cancelled", "AbortError"));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("La vectorización superó el tiempo disponible."));
      }, 60_000);
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = (
        event: MessageEvent<{
          proposal?: RasterNeuralProposal;
          error?: string;
        }>,
      ) => {
        cleanup();
        if (event.data.proposal) resolve(event.data.proposal);
        else reject(new Error(event.data.error));
      };
      worker.onerror = (event) => {
        cleanup();
        reject(new Error(event.message));
      };
      worker.postMessage(
        {
          result,
          pixels: {
            width: geometryCanvas.width,
            height: geometryCanvas.height,
            gray,
          },
        },
        [gray.buffer],
      );
    },
  );
  // The model overlay is square and may contain letterboxing; align it to the
  // same source pixels as the geometry before displaying or saving it.
  const bitmap = await createImageBitmap(
    await (await fetch(result.overlay)).blob(),
  );
  try {
    const preview = document.createElement("canvas"),
      factor = Math.min(1, 1600 / Math.max(canvas.width, canvas.height));
    preview.width = Math.round(canvas.width * factor);
    preview.height = Math.round(canvas.height * factor);
    const context = preview.getContext("2d");
    if (!context) throw new Error("Vista previa no disponible.");
    const c = result.content;
    const region = result.sourceRegion ?? {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    };
    context.drawImage(canvas, 0, 0, preview.width, preview.height);
    context.drawImage(
      bitmap,
      c.x,
      c.y,
      c.width,
      c.height,
      region.x * factor,
      region.y * factor,
      region.width * factor,
      region.height * factor,
    );
    context.lineWidth=2;
    context.strokeStyle='#b22a84';
    context.fillStyle='#7e175b';
    context.font='bold 14px sans-serif';
    for(const [index,item] of (proposal.symbols?.items??[]).entries()) {
      const [x1,y1,x2,y2]=item.box;
      context.strokeRect(x1*factor,y1*factor,(x2-x1)*factor,(y2-y1)*factor);
      context.fillText(`#${index+1}`,x1*factor,Math.max(14,y1*factor-4));
    }
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    return { ...proposal, overlay: preview.toDataURL("image/png") };
  } finally {
    bitmap.close();
  }
}

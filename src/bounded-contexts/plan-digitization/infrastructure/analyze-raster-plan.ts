import type { FloorSlab, Room, Wall } from "../domain/entities/blueprint";
export interface RasterAnalysis {
  walls: Wall[];
  slabs: FloorSlab[];
  rooms: Room[];
  tileCount: number;
  rawProposals: number;
  overlapRatio: number;
}

/** Cancellation terminates CPU work; stale results cannot replace a newer import. */
export async function analyzeRasterPlan(
  canvas: HTMLCanvasElement,
  options: {
    threshold: number;
    metersPerPixel: number;
    wallHeight: number;
    levelId: string;
    signal: AbortSignal;
    onProgress: (fraction: number) => void;
  },
): Promise<RasterAnalysis> {
  if (options.signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const bitmap = await createImageBitmap(canvas);
  if (options.signal.aborted) {
    bitmap.close();
    throw new DOMException("Cancelled", "AbortError");
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./raster-analysis.worker.ts", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => {
      worker.terminate();
      options.signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    options.signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (
      event: MessageEvent<{
        progress?: number;
        error?: string;
        result?: RasterAnalysis;
      }>,
    ) => {
      if (event.data.progress !== undefined)
        options.onProgress(event.data.progress);
      if (event.data.error || event.data.result) {
        cleanup();
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.result!);
      }
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "No se pudo iniciar el análisis."));
    };
    worker.postMessage(
      {
        bitmap,
        threshold: options.threshold,
        metersPerPixel: options.metersPerPixel,
        wallHeight: options.wallHeight,
        levelId: options.levelId,
      },
      [bitmap],
    );
  });
}

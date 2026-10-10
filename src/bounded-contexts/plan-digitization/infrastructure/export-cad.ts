import type { CadPlan } from "../domain/entities/cad-plan";

export function exportCadDwg(plan: CadPlan): Promise<Blob> {
  const worker = new Worker(
    new URL("./cad-export.worker.ts", import.meta.url),
    { type: "module" },
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("La exportación DWG excedió el tiempo disponible."));
    }, 180_000);
    const close = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (
      event: MessageEvent<{ bytes?: Uint8Array<ArrayBuffer>; error?: string }>,
    ) => {
      close();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.bytes)
        resolve(new Blob([event.data.bytes], { type: "application/acad" }));
      else reject(new Error("El escritor DWG no devolvió datos."));
    };
    worker.onerror = (event) => {
      close();
      reject(new Error(event.message));
    };
    worker.postMessage(plan);
  });
}

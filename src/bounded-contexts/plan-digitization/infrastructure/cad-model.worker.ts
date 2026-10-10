import { compileCadBlueprint } from "../domain/cad-reconstruction";
import type { Blueprint } from "../domain/entities/blueprint";
import type { CadPlan } from "../domain/entities/cad-plan";

// Topology and raster connectivity are CPU work, independent of the interactive canvas.
self.onmessage = (
  event: MessageEvent<{ base: Blueprint; cad: CadPlan; height: number }>,
) => {
  try {
    const { base, cad, height } = event.data;
    self.postMessage({ blueprint: compileCadBlueprint(base, cad, height) });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "No se pudo reconstruir el plano.",
    });
  }
};

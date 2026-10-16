import { rasterNeuralProposal } from "../domain/raster-neural";
import type { NeuralPlanResult } from "../domain/neural-plan";
import type { RasterPixels } from "../domain/raster-wall-refinement";
self.onmessage = (
  event: MessageEvent<{ result: NeuralPlanResult; pixels: RasterPixels }>,
) => {
  try {
    self.postMessage({
      proposal: rasterNeuralProposal(event.data.result, event.data.pixels),
    });
  } catch (e) {
    self.postMessage({
      error:
        e instanceof Error ? e.message : "No se pudo vectorizar la máscara.",
    });
  }
};

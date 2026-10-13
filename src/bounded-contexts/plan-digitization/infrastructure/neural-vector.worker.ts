import { buildNeuralCadWalls } from "../domain/neural-plan";
self.onmessage = (event) => {
  try {
    const { cad, region, result, view } = event.data;
    self.postMessage({ walls: buildNeuralCadWalls(cad, region, result, view) });
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
};

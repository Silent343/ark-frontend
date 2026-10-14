import { NeuralVectorization } from "../application/neural-vectorization";
let job: NeuralVectorization | undefined;
self.onmessage = (event) => {
  try {
    const { type, id, cad, region, result, index, metersPerPixel } = event.data;
    if (type === "start")
      job = new NeuralVectorization(cad, region, metersPerPixel);
    else if (type === "tile" && job) job.tile(result, index);
    else if (type === "finish" && job) {
      self.postMessage({ id, data: job.finish() });
      job = undefined;
      return;
    } else throw new Error("Trabajo neuronal no inicializado.");
    self.postMessage({ id });
  } catch (e) {
    job = undefined;
    self.postMessage({
      id: event.data.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};

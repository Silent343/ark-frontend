/** Input parameters owned by the Seismic Simulation bounded context. */
export interface SimulationScenario {
  intensity: number;
  durationSeconds: number;
  direction: "X" | "Y";
}

/** Non-normative visual response category. */
export type VisualResponseLevel = "Low" | "Moderate" | "High";

/** Categorizes visual amplitude without making a structural safety assessment. */
export function classifyVisualResponse(intensity: number): VisualResponseLevel {
  if (intensity <= 3) return "Low";
  if (intensity <= 6) return "Moderate";
  return "High";
}

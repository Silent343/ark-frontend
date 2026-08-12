import { classifyVisualResponse, type SimulationScenario } from "@/bounded-contexts/seismic-simulation/domain/entities/simulation-scenario";

export interface VisualResponseMetrics {
  displacementMillimeters: number;
  interstoryDrift: number;
  level: ReturnType<typeof classifyVisualResponse>;
}

/** Produces educational visualization metrics without a structural safety verdict. */
export class CalculateVisualResponse {
  execute(scenario: SimulationScenario, progress: number): VisualResponseMetrics {
    const boundedProgress = Math.min(Math.max(progress, 0), 1);
    return {
      displacementMillimeters: scenario.intensity * 2.7 * (0.45 + 0.55 * boundedProgress),
      interstoryDrift: scenario.intensity * 0.00072 * (0.55 + 0.45 * boundedProgress),
      level: classifyVisualResponse(scenario.intensity),
    };
  }
}

export const calculateVisualResponse = new CalculateVisualResponse();

import {
  compileCadBlueprint,
  stageCadBlueprint,
} from "../domain/cad-reconstruction";
import type { Blueprint } from "../domain/entities/blueprint";
import type { CadPlan } from "../domain/entities/cad-plan";
import { enrichCadEvidence, detectCadRegions } from "../domain/cad-operations";

// Topology and raster connectivity are CPU work, independent of the interactive canvas.
self.onmessage = (
  event: MessageEvent<{ base: Blueprint; cad: CadPlan; height: number }>,
) => {
  try {
    const { base, cad, height } = event.data;
    if ((base.reconstruction?.version ?? 0) < 3) {
      enrichCadEvidence(cad);
      // Repair only the known automatic crop bug; preserve explicitly edited region bounds and elevations.
      if (
        !cad.regions.length ||
        cad.regions.every(
          (r) => r.id.startsWith("region-cad-") && /^TERRAZA/i.test(r.name),
        )
      )
        cad.regions = detectCadRegions(cad, height);
    }
    self.postMessage({
      blueprint:
        !cad.unitConfirmed &&
        base.review?.warnings.includes("cad-awaiting-units")
          ? stageCadBlueprint(base, cad, height)
          : compileCadBlueprint(base, cad, height),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "No se pudo reconstruir el plano.",
    });
  }
};

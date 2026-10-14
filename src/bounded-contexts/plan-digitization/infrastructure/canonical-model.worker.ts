import type { Blueprint } from "../domain/entities/blueprint";
import { canonicalFromBlueprint } from "../domain/canonical/blueprint-adapter";
import { validateCanonicalGraph } from "../domain/canonical/validate-graph";

self.onmessage = (
  event: MessageEvent<{ plan: Blueprint; appliedCorrespondenceIds: string[] }>,
) => {
  try {
    const graph = canonicalFromBlueprint(
      event.data.plan,
      event.data.appliedCorrespondenceIds,
    );
    if (!graph.issues.some((i) => i.severity === "blocking"))
      validateCanonicalGraph(graph);
    self.postMessage({ graph });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "No se pudo validar la geometría.",
    });
  }
};

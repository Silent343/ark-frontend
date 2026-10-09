import type { BlueprintRepository } from "../../application/ports/blueprint-repository";
import type { Blueprint } from "../../domain/entities/blueprint";
import { hydrateLegacySheetProvenance } from "../../domain/plan-provenance";
import { requestJson } from "@/shared/infrastructure/rest-client";
interface StoredPlan {
  id: string;
  updated_at: string;
  geometry: Blueprint;
}
/** Shares semantic geometry through REST with optimistic revision checks and explicit local migration. */
export class JsonBlueprintRepository implements BlueprintRepository {
  private revisions = new Map<string, StoredPlan>();
  private saves = new Map<string, Promise<void>>();
  private url(id: string) {
    return "/api/v1/projects/" + encodeURIComponent(id) + "/blueprints";
  }
  async findByProjectId(projectId: string): Promise<Blueprint> {
    const rows = await requestJson<StoredPlan[]>(this.url(projectId));
    this.saves.delete(projectId);
    if (rows[0]) {
      this.revisions.set(projectId, rows[0]);
      return hydrateLegacySheetProvenance(rows[0].geometry);
    }
    const seed = (await fetch("/db.json").then((r) => r.json())) as {
      blueprint: Blueprint;
      blueprints?: Blueprint[];
    };
    const project = await requestJson<{ role: string }>(
      this.url(projectId).replace("/blueprints", ""),
    );
    const local =
      typeof window !== "undefined"
        ? window.localStorage.getItem("ark.blueprint.v2." + projectId)
        : null;
    let blueprint = {
      ...(seed.blueprints?.find((p) => p.projectId === projectId) ??
        seed.blueprint),
      projectId,
    };
    // A new workspace starts empty; never pass an unrelated demonstration off as a detected plan.
    if (!seed.blueprints?.some((p) => p.projectId === projectId) && seed.blueprint.projectId !== projectId) {
      blueprint = { ...blueprint, sourceImage: undefined, rooms: [], walls: [], doors: [], windows: [], columns: [], stairs: [], levels: [{ id: "level-1", name: "Planta 1", elevation: 0 }], review: undefined, calibration: undefined };
    }
    // Only the project owner may import pre-authentication browser data into the shared workspace.
    if (local && project.role === "owner") {
      try {
        blueprint = JSON.parse(local) as Blueprint;
      } catch {
        /* The untouched local value remains available for recovery. */
      }
    }
    blueprint = hydrateLegacySheetProvenance(blueprint);
    if (project.role !== "client") {
      try {
        const row = await requestJson<StoredPlan>(this.url(projectId), {
          method: "POST",
          body: JSON.stringify({ geometry: blueprint }),
        });
        this.revisions.set(projectId, row);
      } catch (error) {
        const latest = await requestJson<StoredPlan[]>(this.url(projectId));
        if (!latest[0]) throw error;
        this.revisions.set(projectId, latest[0]);
        return hydrateLegacySheetProvenance(latest[0].geometry);
      }
    }
    return blueprint;
  }
  save(blueprint: Blueprint): Promise<void> {
    const previous = this.saves.get(blueprint.projectId) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(() => this.write(blueprint));
    this.saves.set(blueprint.projectId, pending);
    return pending;
  }
  private async write(blueprint: Blueprint): Promise<void> {
    const current = this.revisions.get(blueprint.projectId);
    const row = await requestJson<StoredPlan>(
      this.url(blueprint.projectId) + (current ? "/" + current.id : ""),
      {
        method: current ? "PATCH" : "POST",
        headers: current
          ? { "If-Match": JSON.stringify(current.updated_at) }
          : {},
        body: JSON.stringify({ geometry: blueprint }),
      },
    );
    this.revisions.set(blueprint.projectId, row);
  }
}

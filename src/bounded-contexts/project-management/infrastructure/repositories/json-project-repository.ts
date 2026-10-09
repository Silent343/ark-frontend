import type { ProjectRepository } from "../../application/ports/project-repository";
import type {
  CreateProjectInput,
  Project,
} from "../../domain/entities/project";
import { requestJson } from "@/shared/infrastructure/rest-client";

/** Explicit anti-corruption mapping for legacy camelCase project consumers. */
export function projectFromDto(dto: Record<string, unknown>): Project {
  return {
    ...dto,
    updatedAt: String(dto.updated_at),
    floorHeight: Number(dto.floor_height),
    structureType: String(dto.structure_type),
    soilType: String(dto.soil_type),
    thumbnailVariant: dto.thumbnail_variant as Project["thumbnailVariant"],
    coverImage: typeof dto.cover_image === "string" ? dto.cover_image : "",
  } as unknown as Project;
}
function projectToDto(input: CreateProjectInput) {
  return {
    name: input.name,
    location: input.location,
    floors: input.floors,
    floor_height: input.floorHeight,
    structure_type: input.structureType,
    soil_type: input.soilType,
    cover_image: input.coverImage ?? "",
  };
}
/**
 * Compatibility name retained for existing composition; persistence now uses the local REST API.
 * Old browser projects are imported once, preserving ids and their locally edited blueprints.
 */
export class JsonProjectRepository implements ProjectRepository {
  private migration: Promise<void> | null = null;
  private migrate() {
    if (typeof window === "undefined") return Promise.resolve();
    if (!this.migration)
      this.migration = (async () => {
        const session = await requestJson<{
          user: { can_import_legacy?: boolean } | null;
        }>("/api/v1/sessions");
        if (!session.user?.can_import_legacy) return;
        const raw = window.localStorage.getItem("ark.projects");
        if (!raw) return;
        const local = JSON.parse(raw) as Project[];
        const existing =
          await requestJson<Array<{ id: string }>>("/api/v1/projects");
        for (const item of local)
          if (!existing.some((p) => p.id === item.id)) {
            await requestJson("/api/v1/projects", {
              method: "POST",
              body: JSON.stringify({ ...projectToDto(item), id: item.id }),
            });
          }
      })().catch((error) => {
        this.migration = null;
        throw error;
      });
    return this.migration;
  }
  async list(): Promise<Project[]> {
    await this.migrate();
    return (
      await requestJson<Record<string, unknown>[]>("/api/v1/projects")
    ).map(projectFromDto);
  }
  async findById(id: string) {
    return (await this.list()).find((p) => p.id === id) ?? null;
  }
  async create(input: CreateProjectInput): Promise<Project> {
    await this.migrate();
    return projectFromDto(
      await requestJson("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify(projectToDto(input)),
      }),
    );
  }
}

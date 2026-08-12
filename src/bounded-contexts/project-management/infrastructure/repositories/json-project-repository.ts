import type { ProjectRepository } from "@/bounded-contexts/project-management/application/ports/project-repository";
import type { CreateProjectInput, Project } from "@/bounded-contexts/project-management/domain/entities/project";

interface LocalDatabase { projects: Project[]; }

const STORAGE_KEY = "teluria.projects";

/**
 * JSON-backed repository for the frontend prototype.
 * User-created projects are layered on the seed file through localStorage.
 * Replace this adapter with an HTTP implementation when FastAPI is available.
 */
export class JsonProjectRepository implements ProjectRepository {
  private databasePromise: Promise<LocalDatabase> | null = null;

  private async getDatabase(): Promise<LocalDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = fetch("/db.json").then(async (response) => {
        if (!response.ok) throw new Error("The local project database could not be loaded.");
        return (await response.json()) as LocalDatabase;
      });
    }
    return this.databasePromise;
  }

  private getLocalProjects(): Project[] {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as Project[];
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      return [];
    }
  }

  async list(): Promise<Project[]> {
    const database = await this.getDatabase();
    return [...this.getLocalProjects(), ...database.projects];
  }

  async findById(id: string): Promise<Project | null> {
    return (await this.list()).find((project) => project.id === id) ?? null;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const project: Project = {
      ...input,
      id: `${slug}-${Date.now()}`,
      updatedAt: new Date().toISOString().slice(0, 10),
      status: "Ready",
      thumbnailVariant: "blueprint",
      progress: 100,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([project, ...this.getLocalProjects()]));
    return project;
  }

}

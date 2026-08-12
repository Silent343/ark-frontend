import type { ProjectRepository } from "@/bounded-contexts/project-management/application/ports/project-repository";

/** Retrieves one Project Management aggregate by its identity. */
export class FindProject {
  constructor(private readonly repository: ProjectRepository) {}

  async execute(projectId: string) {
    const project = await this.repository.findById(projectId);
    if (!project) throw new Error(`Project '${projectId}' was not found.`);
    return project;
  }
}

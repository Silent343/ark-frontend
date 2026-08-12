import type { ProjectRepository } from "@/bounded-contexts/project-management/application/ports/project-repository";
import type { CreateProjectInput } from "@/bounded-contexts/project-management/domain/entities/project";

/** Creates a Project aggregate through the configured persistence boundary. */
export class CreateProject {
  constructor(private readonly repository: ProjectRepository) {}

  execute(input: CreateProjectInput) {
    return this.repository.create(input);
  }
}

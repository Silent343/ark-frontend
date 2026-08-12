import type { ProjectRepository } from "@/bounded-contexts/project-management/application/ports/project-repository";

/** Lists projects without coupling the presentation layer to persistence. */
export class ListProjects {
  constructor(private readonly repository: ProjectRepository) {}

  execute() {
    return this.repository.list();
  }
}

import type { CreateProjectInput, Project } from "@/bounded-contexts/project-management/domain/entities/project";

/** Persistence boundary consumed by application use cases. */
export interface ProjectRepository {
  list(): Promise<Project[]>;
  findById(id: string): Promise<Project | null>;
  create(input: CreateProjectInput): Promise<Project>;
}

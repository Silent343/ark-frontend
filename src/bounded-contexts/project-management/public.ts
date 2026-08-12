import { CreateProject } from "@/bounded-contexts/project-management/application/use-cases/create-project";
import { FindProject } from "@/bounded-contexts/project-management/application/use-cases/find-project";
import { ListProjects } from "@/bounded-contexts/project-management/application/use-cases/list-projects";
import { JsonProjectRepository } from "@/bounded-contexts/project-management/infrastructure/repositories/json-project-repository";

const repository = new JsonProjectRepository();

/** Public application API exposed by the Project Management bounded context. */
export const projectManagement = {
  createProject: new CreateProject(repository),
  findProject: new FindProject(repository),
  listProjects: new ListProjects(repository),
};

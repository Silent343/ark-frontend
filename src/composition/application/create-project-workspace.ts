import { planDigitization } from "@/bounded-contexts/plan-digitization/public";
import type { CreateProjectInput } from "@/bounded-contexts/project-management";
import { projectManagement } from "@/bounded-contexts/project-management/public";

/** Coordinates workspace initialization while keeping both bounded contexts independent. */
export class CreateProjectWorkspace {
  async execute(input: CreateProjectInput) {
    const project = await projectManagement.createProject.execute(input);
    const seed = await planDigitization.getBlueprint.execute(project.id);
    const levels = Array.from(
      { length: Math.max(1, input.floors) },
      (_, index) => ({
        id: `level-${index + 1}`,
        name: index === 0 ? "Ground floor" : `Floor ${index + 1}`,
        elevation: index * input.floorHeight,
      }),
    );
    await planDigitization.saveBlueprint.execute({
      ...seed,
      projectId: project.id,
      levels,
    });
    return project;
  }
}

export const createProjectWorkspace = new CreateProjectWorkspace();

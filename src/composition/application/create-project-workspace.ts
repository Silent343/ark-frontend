import { planDigitization } from "@/bounded-contexts/plan-digitization/public";
import type { CreateProjectInput } from "@/bounded-contexts/project-management";
import { projectManagement } from "@/bounded-contexts/project-management/public";

/** Coordinates workspace initialization while keeping both bounded contexts independent. */
export class CreateProjectWorkspace {
  async execute(input: CreateProjectInput) {
    const project = await projectManagement.createProject.execute(input);
    const seed = await planDigitization.getBlueprint.execute(project.id);
    const basements = Math.max(0, Math.min(10, Math.floor(input.basements ?? 0)));
    const levels = Array.from(
      { length: Math.max(1, input.floors) + basements },
      (_, index) => {
        const floor = index - basements;
        return {
          id: floor < 0 ? `basement-${-floor}` : `level-${floor + 1}`,
          name: floor < 0 ? `Sótano ${-floor}` : `Piso ${floor + 1}`,
          elevation: floor * input.floorHeight,
        };
      },
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

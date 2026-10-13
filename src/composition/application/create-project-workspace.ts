import { planDigitization } from "@/bounded-contexts/plan-digitization/public";
import type { CreateProjectInput } from "@/bounded-contexts/project-management";
import { projectManagement } from "@/bounded-contexts/project-management/public";

/** Coordinates workspace initialization while keeping both bounded contexts independent. */
export class CreateProjectWorkspace {
  async execute(input: CreateProjectInput, onCreated?: (id: string) => void) {
    const project = await projectManagement.createProject.execute(input);
    // Preserve the resource identity even if a subsequent initialization step fails.
    onCreated?.(project.id);
    await this.initialize(project.id, input);
    return project;
  }

  async initialize(projectId: string, input: CreateProjectInput) {
    const seed = await planDigitization.getBlueprint.execute(projectId);
    const basements = Math.max(
      0,
      Math.min(10, Math.floor(input.basements ?? 0)),
    );
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
      projectId,
      intent: input.intent,
      levels,
    });
  }
}

export const createProjectWorkspace = new CreateProjectWorkspace();

import { planDigitization } from "@/bounded-contexts/plan-digitization/public";
import { projectManagement } from "@/bounded-contexts/project-management/public";

/**
 * Cross-context query used by workspace screens.
 *
 * Project Management and Plan Digitization remain unaware of one another;
 * their application results are joined only in this composition layer.
 */
export class GetProjectWorkspace {
  async execute(projectId: string) {
    const [project, blueprint] = await Promise.all([
      projectManagement.findProject.execute(projectId),
      planDigitization.getBlueprint.execute(projectId),
    ]);
    return { project, blueprint };
  }
}

export const getProjectWorkspace = new GetProjectWorkspace();

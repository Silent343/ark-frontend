import { GetSupportCenter, GetWorkspacePreferences, GetWorkspaceProfile, ResetWorkspacePreferences, SaveWorkspacePreferences, SaveWorkspaceProfile, SubmitSupportTicket } from "@/bounded-contexts/workspace-administration/application/use-cases/manage-workspace-administration";
import { JsonWorkspaceAdministrationRepository } from "@/bounded-contexts/workspace-administration/infrastructure/repositories/json-workspace-administration-repository";

const repository = new JsonWorkspaceAdministrationRepository();

/** Public use-case API of the Workspace Administration bounded context. */
export const workspaceAdministration = {
  getProfile: new GetWorkspaceProfile(repository),
  saveProfile: new SaveWorkspaceProfile(repository),
  getPreferences: new GetWorkspacePreferences(repository),
  savePreferences: new SaveWorkspacePreferences(repository),
  resetPreferences: new ResetWorkspacePreferences(repository),
  getSupportCenter: new GetSupportCenter(repository),
  submitTicket: new SubmitSupportTicket(repository),
};

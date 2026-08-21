import type { SupportCenter, SupportTicket, WorkspacePreferences, WorkspaceProfile } from "@/bounded-contexts/workspace-administration/domain/entities/workspace-administration";

/** Dependency-inversion boundary for workspace account and support data. */
export interface WorkspaceAdministrationRepository {
  getProfile(): Promise<WorkspaceProfile>;
  saveProfile(profile: WorkspaceProfile): Promise<WorkspaceProfile>;
  getPreferences(): Promise<WorkspacePreferences>;
  savePreferences(preferences: WorkspacePreferences): Promise<WorkspacePreferences>;
  resetPreferences(): Promise<WorkspacePreferences>;
  getSupportCenter(): Promise<SupportCenter>;
  submitTicket(input: Pick<SupportTicket, "category" | "message">): Promise<SupportTicket>;
}

import type { WorkspaceAdministrationRepository } from "@/bounded-contexts/workspace-administration/application/ports/workspace-administration-repository";
import type { SupportTicket, WorkspacePreferences, WorkspaceProfile } from "@/bounded-contexts/workspace-administration/domain/entities/workspace-administration";

export class GetWorkspaceProfile {
  constructor(private readonly repository: WorkspaceAdministrationRepository) {}
  execute() { return this.repository.getProfile(); }
}

export class SaveWorkspaceProfile {
  constructor(private readonly repository: WorkspaceAdministrationRepository) {}
  execute(profile: WorkspaceProfile) { return this.repository.saveProfile(profile); }
}

export class GetWorkspacePreferences {
  constructor(private readonly repository: WorkspaceAdministrationRepository) {}
  execute() { return this.repository.getPreferences(); }
}

export class SaveWorkspacePreferences {
  constructor(private readonly repository: WorkspaceAdministrationRepository) {}
  execute(preferences: WorkspacePreferences) { return this.repository.savePreferences(preferences); }
}

export class ResetWorkspacePreferences {
  constructor(private readonly repository: WorkspaceAdministrationRepository) {}
  execute() { return this.repository.resetPreferences(); }
}

export class GetSupportCenter {
  constructor(private readonly repository: WorkspaceAdministrationRepository) {}
  execute() { return this.repository.getSupportCenter(); }
}

export class SubmitSupportTicket {
  constructor(private readonly repository: WorkspaceAdministrationRepository) {}
  execute(input: Pick<SupportTicket, "category" | "message">) {
    if (input.message.trim().length < 12) throw new Error("Describe el inconveniente con al menos 12 caracteres.");
    return this.repository.submitTicket({ ...input, message: input.message.trim() });
  }
}

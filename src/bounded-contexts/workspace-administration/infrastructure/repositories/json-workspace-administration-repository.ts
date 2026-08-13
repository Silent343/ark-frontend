import type { WorkspaceAdministrationRepository } from "@/bounded-contexts/workspace-administration/application/ports/workspace-administration-repository";
import type { SupportCenter, SupportTicket, WorkspacePreferences, WorkspaceProfile } from "@/bounded-contexts/workspace-administration/domain/entities/workspace-administration";

interface WorkspaceDatabase {
  workspaceAdministration: { profile: WorkspaceProfile; preferences: WorkspacePreferences; support: SupportCenter };
}

const PROFILE_STORAGE_KEY = "teluria.workspace-profile";
const PREFERENCES_STORAGE_KEY = "teluria.workspace-preferences";
const TICKETS_STORAGE_KEY = "teluria.support-tickets";

/** JSON seed adapter with browser persistence for editable prototype state. */
export class JsonWorkspaceAdministrationRepository implements WorkspaceAdministrationRepository {
  private databasePromise: Promise<WorkspaceDatabase> | null = null;

  private getDatabase(): Promise<WorkspaceDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = fetch("/db.json").then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar la configuración local.");
        return (await response.json()) as WorkspaceDatabase;
      });
    }
    return this.databasePromise;
  }

  private readLocal<T>(key: string): T | null {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; }
    catch { window.localStorage.removeItem(key); return null; }
  }

  async getProfile() { return this.readLocal<WorkspaceProfile>(PROFILE_STORAGE_KEY) ?? (await this.getDatabase()).workspaceAdministration.profile; }
  async saveProfile(profile: WorkspaceProfile) { window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile)); return profile; }
  async getPreferences() { return this.readLocal<WorkspacePreferences>(PREFERENCES_STORAGE_KEY) ?? (await this.getDatabase()).workspaceAdministration.preferences; }
  async savePreferences(preferences: WorkspacePreferences) { window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences)); return preferences; }
  async getSupportCenter() { return (await this.getDatabase()).workspaceAdministration.support; }

  async submitTicket(input: Pick<SupportTicket, "category" | "message">) {
    const ticket: SupportTicket = { ...input, id: `ticket-${Date.now()}`, createdAt: new Date().toISOString(), status: "Queued locally" };
    const tickets = this.readLocal<SupportTicket[]>(TICKETS_STORAGE_KEY) ?? [];
    window.localStorage.setItem(TICKETS_STORAGE_KEY, JSON.stringify([ticket, ...tickets]));
    return ticket;
  }
}

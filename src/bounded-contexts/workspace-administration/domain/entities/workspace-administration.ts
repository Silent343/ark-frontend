export interface RecentActivity {
  id: string;
  category: "Creation" | "Analysis" | "Export" | "System" | "Edition";
  description: string;
  occurredAt: string;
}

/** User profile owned by the Workspace Administration bounded context. */
export interface WorkspaceProfile {
  id: string;
  initials: string;
  fullName: string;
  email: string;
  phone: string;
  organization: string;
  position: string;
  licenseNumber: string;
  specialty: string;
  experienceYears: number;
  country: string;
  analysisLanguage: string;
  membership: string;
  recentActivity: RecentActivity[];
}

export type UnitSystem = "Metric" | "Imperial";

/** Personal workspace settings persisted locally until a backend is connected. */
export interface WorkspacePreferences {
  language: string;
  unitSystem: UnitSystem;
  timezone: string;
  darkMode: boolean;
  compactDensity: boolean;
  emailNotifications: boolean;
  simulationAlerts: boolean;
  sharedProjectUpdates: boolean;
  renderQuality: string;
  seismicStandard: string;
  simulationAutosave: boolean;
  cloudStorageUsedGb: number;
  cloudStorageLimitGb: number;
}

export interface SupportCategory {
  id: string;
  title: string;
  description: string;
  icon: "Rocket" | "Book" | "Question" | "Sparkles";
}

export interface SupportArticle {
  id: string;
  category: string;
  title: string;
}

export interface SupportChannel {
  id: string;
  title: string;
  detail: string;
  icon: "Mail" | "Message" | "Community";
}

/** Read model for the frontend-only support center. */
export interface SupportCenter {
  categories: SupportCategory[];
  articles: SupportArticle[];
  channels: SupportChannel[];
  version: string;
  lastUpdated: string;
}

export interface SupportTicket {
  id: string;
  category: string;
  message: string;
  createdAt: string;
  status: "Queued locally";
}

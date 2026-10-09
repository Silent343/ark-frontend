import type { WorkspacePreferences } from "@/bounded-contexts/workspace-administration/domain/entities/workspace-administration";

const languageCodes: Record<string, string> = {
  "Español (Latinoamérica)": "es-419",
  English: "en",
  Português: "pt-BR",
};

/** Applies browser-visible preferences without leaking DOM concerns into the domain. */
export function applyWorkspacePreferences(preferences: WorkspacePreferences) {
  const root = document.documentElement;
  root.lang = languageCodes[preferences.language] ?? "es";
  root.dataset.locale = root.lang.startsWith("en") ? "en" : root.lang.startsWith("pt") ? "pt" : "es";
  root.dataset.theme = preferences.darkMode ? "dark" : "light";
  root.dataset.density = preferences.compactDensity ? "compact" : "comfortable";
  root.dataset.units = preferences.unitSystem.toLowerCase();
  root.dataset.renderQuality = preferences.renderQuality.startsWith("Alta") ? "high" : preferences.renderQuality.startsWith("Baja") ? "low" : "balanced";
  window.dispatchEvent(new CustomEvent("ark:preferences-changed", { detail: preferences }));
}

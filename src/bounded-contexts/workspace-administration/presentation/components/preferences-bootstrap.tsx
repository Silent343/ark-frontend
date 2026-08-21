"use client";

import { useEffect } from "react";
import { applyWorkspacePreferences } from "@/bounded-contexts/workspace-administration/presentation/lib/apply-workspace-preferences";
import { workspaceAdministration } from "@/bounded-contexts/workspace-administration/public";

/** Restores locally persisted visual preferences on every application load. */
export function PreferencesBootstrap() {
  useEffect(() => {
    let active = true;
    void workspaceAdministration.getPreferences.execute().then((preferences) => {
      if (active) applyWorkspacePreferences(preferences);
    });
    return () => { active = false; };
  }, []);
  return null;
}

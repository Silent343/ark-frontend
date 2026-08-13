"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupportCenter, WorkspacePreferences, WorkspaceProfile } from "@/bounded-contexts/workspace-administration/domain/entities/workspace-administration";
import { workspaceAdministration } from "@/bounded-contexts/workspace-administration/public";

interface ResourceState<T> { data: T | null; loading: boolean; error: string | null }

function useResource<T>(loader: () => Promise<T>) {
  const [state, setState] = useState<ResourceState<T>>({ data: null, loading: true, error: null });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try { setState({ data: await loader(), loading: false, error: null }); }
    catch (error) { setState({ data: null, loading: false, error: error instanceof Error ? error.message : "Error desconocido" }); }
  }, [loader]);
  useEffect(() => {
    let active = true;
    void loader()
      .then((data) => { if (active) setState({ data, loading: false, error: null }); })
      .catch((error: unknown) => { if (active) setState({ data: null, loading: false, error: error instanceof Error ? error.message : "Error desconocido" }); });
    return () => { active = false; };
  }, [loader]);
  return { ...state, reload: load };
}

const loadProfile = () => workspaceAdministration.getProfile.execute();
const loadPreferences = () => workspaceAdministration.getPreferences.execute();
const loadSupport = () => workspaceAdministration.getSupportCenter.execute();

/** Loads the locally persisted workspace profile through its application use case. */
export function useWorkspaceProfile() { return useResource<WorkspaceProfile>(loadProfile); }

/** Loads user preferences without exposing the JSON adapter to presentation code. */
export function useWorkspacePreferences() { return useResource<WorkspacePreferences>(loadPreferences); }

/** Loads help-center content from the local prototype database. */
export function useSupportCenter() { return useResource<SupportCenter>(loadSupport); }

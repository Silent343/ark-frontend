"use client";

import { useCallback, useEffect, useState } from "react";
import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import type { Project } from "@/bounded-contexts/project-management";
import { getProjectWorkspace } from "@/composition/application/get-project-workspace";

interface WorkspaceState {
  data: { project: Project; blueprint: Blueprint } | null;
  loading: boolean;
  error: string | null;
}

/** Presentation adapter for the cross-context workspace query. */
export function useProjectWorkspace(projectId: string) {
  const [state, setState] = useState<WorkspaceState>({
    data: null,
    loading: true,
    error: null,
  });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      setState({
        data: await getProjectWorkspace.execute(projectId),
        loading: false,
        error: null,
      });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [projectId]);

  useEffect(() => {
    let active = true;
    void getProjectWorkspace
      .execute(projectId)
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  return { ...state, reload: load };
}

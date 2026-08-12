"use client";

import { useCallback, useEffect, useState } from "react";
import type { Project } from "@/bounded-contexts/project-management/domain/entities/project";
import { projectManagement } from "@/bounded-contexts/project-management/public";

interface ProjectListState { data: Project[] | null; loading: boolean; error: string | null; }

/** Presentation adapter for the Project Management list use case. */
export function useProjects() {
  const [state, setState] = useState<ProjectListState>({ data: null, loading: true, error: null });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try { setState({ data: await projectManagement.listProjects.execute(), loading: false, error: null }); }
    catch (error) { setState({ data: null, loading: false, error: error instanceof Error ? error.message : "Unknown error" }); }
  }, []);

  useEffect(() => {
    let active = true;
    void projectManagement.listProjects.execute()
      .then((data) => { if (active) setState({ data, loading: false, error: null }); })
      .catch((error: unknown) => { if (active) setState({ data: null, loading: false, error: error instanceof Error ? error.message : "Unknown error" }); });
    return () => { active = false; };
  }, []);

  return { ...state, reload: load };
}

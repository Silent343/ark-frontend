"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { projectManagement } from "@/bounded-contexts/project-management/public";
import type { Project } from "@/bounded-contexts/project-management";
import { tasks } from "@/bounded-contexts/task-management/public";
import { milestones } from "@/bounded-contexts/project-planning/public";
import { documents } from "@/bounded-contexts/document-management/public";
import { issues } from "@/bounded-contexts/issue-management/public";
import { budgetItems } from "@/bounded-contexts/cost-management/public";
import { approvals } from "@/bounded-contexts/client-approvals/public";
import type { Task } from "@/bounded-contexts/task-management";
import type { Milestone } from "@/bounded-contexts/project-planning";
import type { ProjectDocument } from "@/bounded-contexts/document-management";
import type { Issue } from "@/bounded-contexts/issue-management";
import type { BudgetItem } from "@/bounded-contexts/cost-management";
import type { Approval } from "@/bounded-contexts/client-approvals";
import { requestJson } from "@/shared/infrastructure/rest-client";
import {
  loadCoordination,
  type CoordinationData,
} from "@/composition/application/load-coordination";
import type { ProjectRole } from "@/bounded-contexts/identity-access";

export interface ManagedProject extends Project {
  role: ProjectRole;
  current_user_id: string;
  updated_at: string;
  phase: string;
  client_name: string;
  owner_name: string;
  target_date: string;
  budget_total: number;
  currency: string;
}
export interface WorkspaceData {
  coordination: CoordinationData;
  project: ManagedProject;
  tasks: Task[];
  milestones: Milestone[];
  documents: ProjectDocument[];
  issues: Issue[];
  budgetItems: BudgetItem[];
  approvals: Approval[];
  activities: Array<{
    id: string;
    title: string;
    action: string;
    created_at: string;
  }>;
}
export const workspaceServices = {
  tasks,
  milestones,
  documents,
  issues,
  budgetItems,
  approvals,
};
interface WorkspaceContextValue {
  data: WorkspaceData | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  notice: string;
  reload: () => Promise<void>;
  mutate: (operation: () => Promise<unknown>) => Promise<boolean>;
}
const Context = createContext<WorkspaceContextValue | null>(null);
/** Composes read models without importing internal contracts across bounded contexts. */
export function WorkspaceProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const project = await projectManagement.findProject.execute(projectId);
    if (!project) throw new Error("Project not found.");
    const client = (project as ManagedProject).role === "client";
    const coordination = await loadCoordination(
      projectId,
      (project as ManagedProject).role,
    );
    const [
      taskRows,
      milestoneRows,
      documentRows,
      issueRows,
      costRows,
      approvalRows,
      activities,
    ] = await Promise.all([
      client ? Promise.resolve([]) : tasks.list(projectId),
      client ? Promise.resolve([]) : milestones.list(projectId),
      documents.list(projectId),
      client ? Promise.resolve([]) : issues.list(projectId),
      client ? Promise.resolve([]) : budgetItems.list(projectId),
      approvals.list(projectId),
      client
        ? Promise.resolve([])
        : requestJson<WorkspaceData["activities"]>(
            "/api/v1/projects/" + encodeURIComponent(projectId) + "/activities",
          ),
    ]);
    return {
      project: project as ManagedProject,
      coordination,
      tasks: taskRows,
      milestones: milestoneRows,
      documents: documentRows,
      issues: issueRows,
      budgetItems: costRows,
      approvals: approvalRows,
      activities,
    };
  }, [projectId]);
  const reload = useCallback(async () => {
    setError(null);
    try {
      setData(await load());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [load]);
  useEffect(() => {
    let active = true;
    load()
      .then((value) => {
        if (active) {
          setData(value);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError((e as Error).message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !busy) void reload();
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [reload, busy]);
  const mutate = async (operation: () => Promise<unknown>) => {
    if (busy) return false;
    setBusy(true);
    setNotice("");
    setError(null);
    try {
      await operation();
      setData(await load());
      setNotice("saved");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <Context.Provider
      value={{ data, loading, error, busy, notice, reload, mutate }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("WorkspaceProvider is required.");
  return context;
}
/** Progress measures completed tasks; empty projects start at zero, not a synthetic percentage. */
export function progressOf(tasks: Task[]) {
  return tasks.length
    ? Math.round(
        (tasks.filter((t) => t.status === "done").length / tasks.length) * 100,
      )
    : 0;
}

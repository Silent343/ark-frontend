import { NextResponse } from "next/server";
import {
  requireUser,
  projectRole,
} from "@/bounded-contexts/identity-access/server";
import type { SessionUser } from "@/bounded-contexts/identity-access";
import {
  HttpError,
  fail,
  checkOrigin,
} from "@/kernel/infrastructure/http-error";
import { authorize, visibleRows, publishChange } from "./collaboration-policy";
import {
  isCollaborationResource,
  collaborationRequest,
} from "./collaboration-rest";
import { TaskRules } from "@/bounded-contexts/task-management";
import { MilestoneRules } from "@/bounded-contexts/project-planning";
import { ProjectDocumentRules } from "@/bounded-contexts/document-management";
import { IssueRules } from "@/bounded-contexts/issue-management";
import { BudgetItemRules } from "@/bounded-contexts/cost-management";
import { ApprovalRules } from "@/bounded-contexts/client-approvals";
import { ValidationError, type ResourceRules } from "@/kernel/domain/resource";
import { ProjectRules as projectRules } from "@/bounded-contexts/project-management";
import {
  table,
  record,
  withDatabase,
  type WorkspaceDatabase,
  type StoredRecord,
} from "./workspace-store";

const definitions: Record<string, { table: string; rules: ResourceRules }> = {
  tasks: { table: "tasks", rules: TaskRules },
  milestones: { table: "milestones", rules: MilestoneRules },
  documents: { table: "documents", rules: ProjectDocumentRules },
  issues: { table: "issues", rules: IssueRules },
  "budget-items": { table: "budget_items", rules: BudgetItemRules },
  approvals: { table: "approvals", rules: ApprovalRules },
};
/** Private commercial totals never leave the server for client-role project views. */
function publicProject(row: StoredRecord, role: string) {
  const copy = { ...row };
  if (role === "client") {
    delete copy.budget_total;
  }
  return copy;
}
function project(db: WorkspaceDatabase, id: string) {
  return (
    table(db, "projects").find((p) => p.id === id) ??
    fail(404, "Project not found.")
  );
}
async function body(request: Request) {
  const text = await request.text();
  if (text.length > 4_300_000) fail(413, "File is too large (maximum 3 MB).");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail(400, "Invalid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "Expected a JSON object.");
  return value as Record<string, unknown>;
}
function validateInput(
  input: Record<string, unknown>,
  rules: ResourceRules,
  allowId = false,
) {
  if (
    Object.keys(input).some(
      (key) => !rules.fields.includes(key) && !(allowId && key === "id"),
    )
  )
    fail(400, "Unknown or read-only field.");
  for (const value of Object.values(input))
    if (
      typeof value === "string" &&
      value.length > 4000 &&
      !String(value).startsWith("data:")
    )
      fail(400, "Text is too long.");
}
function checkVersion(request: Request, row: StoredRecord) {
  const version = request.headers.get("if-match");
  if (!version) fail(428, "Reload the resource before editing.");
  if (version?.replace(/^"|"$/g, "") !== row.updated_at)
    fail(409, "This item has changed. Reload before saving again.");
}
/** Complete records use scalar, allowlisted fields, keeping malformed payloads out of rendered views. */
function validateCandidate(value: StoredRecord, rules: ResourceRules) {
  const numeric = new Set([
    "floors",
    "floor_height",
    "progress",
    "budget_total",
    "quantity",
    "unit_cost",
    "actual_cost",
    "version",
    "lag_days",
  ]);
  for (const field of rules.fields) {
    if (numeric.has(field)) {
      if (typeof value[field] !== "number")
        fail(422, field + ": expected a number.");
    } else if (typeof value[field] !== "string")
      fail(422, field + ": expected text.");
  }
  rules.validate(value);
}
function audit(
  db: WorkspaceDatabase,
  projectId: string,
  action: string,
  title: string,
  user: SessionUser,
  resource: string,
  row: StoredRecord,
  previous?: StoredRecord,
) {
  void projectId;
  void title;
  publishChange(db, user, resource, action, row, previous);
}
function relationships(
  db: WorkspaceDatabase,
  resource: string,
  candidate: StoredRecord,
  current?: StoredRecord,
) {
  if (resource === "documents") {
    if (
      current &&
      [
        "file_data",
        "version",
        "previous_version_id",
        "file_name",
        "mime_type",
      ].some((key) => candidate[key] !== current[key])
    )
      fail(409, "Upload a new version to replace a file.");
    if (!current && candidate.previous_version_id) {
      const previous = table(db, "documents").find(
        (d) =>
          d.id === candidate.previous_version_id &&
          d.project_id === candidate.project_id,
      );
      if (!previous) return fail(422, "Previous document version not found.");
      if (
        candidate.version !== Number(previous.version) + 1 ||
        table(db, "documents").some(
          (d) => d.previous_version_id === previous.id,
        )
      )
        fail(409, "A newer version already exists.");
    } else if (!current && candidate.version !== 1)
      fail(422, "First document version must be 1.");
  }
  if (resource === "approvals") {
    const document = candidate.document_id
      ? table(db, "documents").find(
          (d) =>
            d.id === candidate.document_id &&
            d.project_id === candidate.project_id,
        )
      : null;
    if (candidate.document_id && !document)
      fail(422, "Document does not belong to this project.");
    if (candidate.status !== "pending") {
      candidate.decided_at = new Date().toISOString();
      if (document) {
        document.status = candidate.status;
        document.updated_at = candidate.decided_at as string;
      }
    } else candidate.decided_at = "";
  }
}
/** REST delivery adapter. All mutations validate project ownership and resource invariants. */
export async function handleWorkspaceRequest(
  request: Request,
  params: { projectId?: string; resource?: string; resourceId?: string },
) {
  try {
    checkOrigin(request);
    const { projectId, resource, resourceId } = params;
    const method = request.method;
    const input = ["POST", "PATCH"].includes(method) ? await body(request) : {};
    const result = await withDatabase((db) => {
      const user = requireUser(db, request);
      const role = projectId ? projectRole(db, projectId, user.id) : undefined;
      if (role) authorize(role, resource ?? "projects", method);
      if (projectId && resource && isCollaborationResource(resource))
        return collaborationRequest(
          db,
          request,
          projectId,
          resource,
          resourceId,
          input,
          user,
          role!,
        );
      if (!resource) {
        if (method === "GET")
          return projectId
            ? {
                ...publicProject(project(db, projectId), role!),
                role,
                current_user_id: user.id,
              }
            : table(db, "projects")
                .filter((p) =>
                  table(db, "members").some(
                    (m) => m.project_id === p.id && m.user_id === user.id,
                  ),
                )
                .map((p) => {
                  const tasks = table(db, "tasks").filter(
                    (t) => t.project_id === p.id,
                  );
                  return {
                    ...publicProject(p, projectRole(db, p.id, user.id)),
                    role: projectRole(db, p.id, user.id),
                    current_user_id: user.id,
                    management: {
                      progress: tasks.length
                        ? Math.round(
                            (tasks.filter((t) => t.status === "done").length /
                              tasks.length) *
                              100,
                          )
                        : 0,
                      task_count: tasks.length,
                      open_issues: table(db, "issues").filter(
                        (i) => i.project_id === p.id && i.status !== "resolved",
                      ).length,
                      pending_approvals: table(db, "approvals").filter(
                        (a) => a.project_id === p.id && a.status === "pending",
                      ).length,
                      budget_actual: (projectRole(db, p.id, user.id) ===
                      "client"
                        ? []
                        : table(db, "budget_items")
                      )
                        .filter((i) => i.project_id === p.id)
                        .reduce((s, i) => s + Number(i.actual_cost), 0),
                      next_milestone:
                        table(db, "milestones")
                          .filter(
                            (m) =>
                              m.project_id === p.id && m.status !== "completed",
                          )
                          .sort((a, b) =>
                            String(a.due_date).localeCompare(
                              String(b.due_date),
                            ),
                          )[0]?.title ?? "",
                    },
                  };
                });
        if (method === "POST" && !projectId) {
          validateInput(input, projectRules, true);
          const now = new Date().toISOString();
          const id =
            typeof input.id === "string" ? input.id : crypto.randomUUID();
          if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id))
            fail(400, "Invalid project id.");
          if (table(db, "projects").some((p) => p.id === id))
            fail(409, "Project already exists.");
          const row = {
            status: "Ready",
            thumbnail_variant: "blueprint",
            progress: 0,
            phase: "proposal",
            client_name: "",
            owner_name: user.name,
            target_date: "",
            budget_total: 0,
            currency: "PEN",
            ...input,
            id,
            project_id: id,
            created_at: now,
            updated_at: now,
          } as StoredRecord;
          validateCandidate(row, projectRules);
          table(db, "projects").unshift(row);
          table(db, "members").push(
            record(id, {
              user_id: user.id,
              name: user.name,
              email: user.email,
              role: "owner",
            }),
          );
          audit(db, id, "created", String(row.name), user, "projects", row);
          return row;
        }
        if (method === "PATCH" && projectId) {
          const current = project(db, projectId);
          const previous = { ...current };
          checkVersion(request, current);
          validateInput(input, projectRules);
          const next = {
            ...current,
            ...input,
            updated_at: new Date().toISOString(),
          };
          validateCandidate(next, projectRules);
          Object.assign(current, next);
          audit(
            db,
            projectId,
            "updated",
            String(current.name),
            user,
            "projects",
            current,
            previous,
          );
          return current;
        }
        return fail(405, "Method not allowed.");
      }
      if (!projectId) return fail(400, "Project id required.");
      project(db, projectId);
      if (resource === "activities" && method === "GET" && !resourceId)
        return table(db, "activities")
          .filter((r) => r.project_id === projectId)
          .slice(-12)
          .reverse();
      const definition = definitions[resource];
      if (!definition) return fail(404, "Resource not found.");
      const rows = table(db, definition.table);
      const readable = visibleRows(db, resource, rows, role!, user.id);
      const current = resourceId
        ? readable.find(
            (row) => row.id === resourceId && row.project_id === projectId,
          )
        : undefined;
      if (resourceId && !current) return fail(404, "Resource not found.");
      if (method === "GET")
        return (
          current ?? readable.filter((row) => row.project_id === projectId)
        );
      if (method === "DELETE" && current) {
        if (
          resource === "tasks" &&
          table(db, "task_dependencies").some(
            (e) =>
              e.predecessor_id === current.id || e.successor_id === current.id,
          )
        )
          fail(409, "Remove task dependencies first.");
        if (
          resource === "documents" &&
          table(db, "deliverable_packages").some(
            (p) =>
              Array.isArray(p.document_ids) &&
              p.document_ids.includes(current.id),
          )
        )
          fail(409, "This version belongs to a deliverable package.");
        checkVersion(request, current);
        if (
          resource === "documents" &&
          (table(db, "approvals").some((a) => a.document_id === current.id) ||
            rows.some((d) => d.previous_version_id === current.id))
        )
          fail(
            409,
            "This document is referenced by an approval or a newer version.",
          );
        db[definition.table] = rows.filter((row) => row !== current);
        audit(
          db,
          projectId,
          "deleted",
          String(current.title),
          user,
          resource,
          current,
        );
        return null;
      }
      if (
        (method === "POST" && !resourceId) ||
        (method === "PATCH" && current)
      ) {
        if (current) checkVersion(request, current);
        validateInput(input, definition.rules);
        if (resource === "budget-items") {
          input.supplier ??= current?.supplier ?? "";
          input.stage ??= current?.stage ?? "design";
        }
        if (resource === "tasks") {
          input.start_date ??= current?.start_date ?? input.due_date;
          input.assignee_id ??= current?.assignee_id ?? "";
        }
        if (resource === "approvals") {
          if (
            role === "client" &&
            (current?.reviewer_id !== user.id ||
              Object.keys(input).some(
                (k) => !["status", "feedback", "reviewer"].includes(k),
              ))
          )
            fail(403, "Only your assigned review can be answered.");
          input.reviewer_id ??= current?.reviewer_id ?? "";
          if (
            input.reviewer_id &&
            !table(db, "members").some(
              (m) =>
                m.project_id === projectId && m.user_id === input.reviewer_id,
            )
          )
            fail(422, "Reviewer must be a project member.");
          if (input.status && input.status !== "pending") {
            if ((input.reviewer_id || current?.reviewer_id) !== user.id)
              fail(403, "Only the assigned reviewer can decide.");
            input.reviewer = user.name;
            input.decided_by = user.id;
          }
        }
        const now = new Date().toISOString();
        const candidate = {
          ...current,
          ...input,
          id: current?.id ?? crypto.randomUUID(),
          project_id: projectId,
          created_at: current?.created_at ?? now,
          updated_at: now,
        } as StoredRecord;
        validateCandidate(candidate, definition.rules);
        if (resource === "tasks") {
          if (candidate.assignee_id) {
            const member = table(db, "members").find(
              (m) =>
                m.project_id === projectId &&
                m.user_id === candidate.assignee_id &&
                m.role !== "client",
            );
            if (!member) fail(422, "Select a team member.");
            candidate.assignee = member.name;
          }
          if (
            ["in_progress", "review", "done"].includes(
              String(candidate.status),
            ) &&
            table(db, "task_dependencies").some(
              (e) =>
                e.project_id === projectId &&
                e.successor_id === candidate.id &&
                table(db, "tasks").find((t) => t.id === e.predecessor_id)
                  ?.status !== "done",
            )
          )
            fail(409, "Complete predecessor tasks first.");
        }
        const previous = current ? { ...current } : undefined;
        relationships(db, resource, candidate, current);
        if (current) Object.assign(current, candidate);
        else rows.push(candidate);
        audit(
          db,
          projectId,
          current ? "updated" : "created",
          String(candidate.title),
          user,
          resource,
          candidate,
          previous,
        );
        return candidate;
      }
      return fail(405, "Method not allowed.");
    }, method !== "GET");
    if (method === "DELETE") return new NextResponse(null, { status: 204 });
    return NextResponse.json(
      { data: result },
      {
        status: method === "POST" ? 201 : 200,
        headers: {
          "Cache-Control": "no-store",
          // Lets destructive integration tests fail closed outside the isolated QA store.
          ...(process.env.TELURIA_TEST_MODE === "1"
            ? { "X-Teluria-Test-Mode": "1" }
            : {}),
          ...(!Array.isArray(result) && result
            ? { ETag: JSON.stringify((result as StoredRecord).updated_at) }
            : {}),
          ...(method === "POST"
            ? {
                Location:
                  new URL(request.url).pathname +
                  "/" +
                  (result as StoredRecord).id,
              }
            : {}),
        },
      },
    );
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof ValidationError
          ? 422
          : 500;
    if (status === 500) console.error("Workspace REST failure", error);
    return NextResponse.json(
      {
        error: {
          code: status,
          message:
            status === 500
              ? "Workspace storage is unavailable."
              : (error as Error).message,
        },
      },
      { status },
    );
  }
}

import {
  table,
  record,
  type WorkspaceDatabase,
  type StoredRecord,
} from "./workspace-store";
import { token, digest } from "@/bounded-contexts/identity-access/server";
import {
  type SessionUser,
  type ProjectRole,
  canManage,
} from "@/bounded-contexts/identity-access";
import { fail } from "@/kernel/infrastructure/http-error";
import {
  publishChange,
  visibleRows,
  canReadDocument,
} from "./collaboration-policy";
import { CalendarEventRules } from "@/bounded-contexts/project-scheduling";
import { validateSharedBlueprint } from "@/bounded-contexts/plan-digitization";
import { CommentRules } from "@/bounded-contexts/collaboration";
import { DeliverablePackageRules } from "@/bounded-contexts/delivery-management";
import {
  analyzeSchedule,
  type ScheduledTask,
  type Dependency,
} from "@/bounded-contexts/project-scheduling";
const names: Record<string, string> = {
  "calendar-events": "calendar_events",
  "task-dependencies": "task_dependencies",
  "deliverable-packages": "deliverable_packages",
  members: "members",
  invitations: "invitations",
  comments: "comments",
  notifications: "notifications",
  "change-log": "activities",
  blueprints: "blueprints",
};
export const isCollaborationResource = (name: string) => name in names;
function version(request: Request, row: StoredRecord) {
  if (!request.headers.get("if-match"))
    fail(428, "Reload this item before editing.");
  if (request.headers.get("if-match")?.replace(/^"|"$/g, "") !== row.updated_at)
    fail(409, "This item changed. Reload before saving.");
}
/** Validates references and permissions in the same database transaction as each write. */
export function collaborationRequest(
  db: WorkspaceDatabase,
  request: Request,
  projectId: string,
  resource: string,
  id: string | undefined,
  input: Record<string, unknown>,
  user: SessionUser,
  role: ProjectRole,
) {
  const method = request.method,
    name = names[resource],
    all = table(db, name),
    rows = all.filter((r) => r.project_id === projectId);
  const visible = visibleRows(db, resource, rows, role, user.id),
    current = id ? visible.find((r) => r.id === id) : undefined;
  if (id && !current) fail(404, "Resource not found.");
  if (method === "GET") {
    if (resource === "invitations")
      return rows.map(({ token_hash, ...safe }) => {
        void token_hash;
        return safe;
      });
    if (resource === "change-log") return [...rows].reverse();
    return current ?? visible;
  }
  if (resource === "change-log") fail(405, "The change log is immutable.");
  if (method === "DELETE") {
    if (!current) fail(405, "Item id required.");
    version(request, current);
    if (
      resource === "members" &&
      (current.role === "owner" || current.user_id === user.id)
    )
      fail(409, "The owner cannot be removed.");
    if (
      resource === "comments" &&
      current.author_id !== user.id &&
      !canManage(role)
    )
      fail(403, "Only the author or project manager can delete this comment.");
    if (resource === "notifications" || resource === "blueprints")
      fail(405, "Deletion is not supported.");
    db[name] = all.filter((r) => r.id !== current.id);
    publishChange(db, user, resource, "deleted", current);
    return null;
  }
  if (
    !["POST", "PATCH"].includes(method) ||
    (method === "POST" && id) ||
    (method === "PATCH" && !current)
  )
    fail(405, "Method not allowed.");
  if (current) version(request, current);
  if (resource === "invitations") {
    if (current) {
      if (
        Object.keys(input).some((k) => k !== "status") ||
        input.status !== "revoked"
      )
        fail(422, "Only revocation is supported.");
      current.status = "revoked";
      current.updated_at = new Date().toISOString();
      return { id: current.id, status: current.status };
    }
    const email = String(input.email ?? "")
        .trim()
        .toLowerCase(),
      inviteRole = String(input.role);
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !["architect", "collaborator", "client"].includes(inviteRole)
    )
      fail(422, "Choose an email and role.");
    if (
      rows.some(
        (r) =>
          r.email === email &&
          r.status === "pending" &&
          String(r.expires_at) > new Date().toISOString(),
      )
    )
      fail(409, "A pending invitation already exists.");
    const secret = token(),
      invite = record(projectId, {
        email,
        role: inviteRole,
        token_hash: digest(secret),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        status: "pending",
      });
    all.push(invite);
    publishChange(db, user, resource, "created", invite);
    return {
      id: invite.id,
      email,
      role: inviteRole,
      expires_at: invite.expires_at,
      invitation_url: new URL("/invitations/" + secret, request.url).href,
    };
  }
  if (resource === "members") {
    if (!current) fail(405, "Add members using an invitation.");
    if (current.role === "owner" || current.user_id === user.id)
      fail(409, "The owner role cannot be changed here.");
    if (
      Object.keys(input).some((k) => k !== "role") ||
      !["architect", "collaborator", "client"].includes(String(input.role))
    )
      fail(422, "Choose a valid role.");
  }
  if (resource === "notifications") {
    if (!current || Object.keys(input).some((k) => k !== "read_at"))
      fail(422, "Only read state can be changed.");
    input.read_at = new Date().toISOString();
  }
  const editable: Record<string, string[]> = {
    members: ["role"],
    notifications: ["read_at"],
    "task-dependencies": ["predecessor_id", "successor_id", "lag_days"],
    blueprints: ["geometry"],
    comments: [...CommentRules.fields],
    "calendar-events": [...CalendarEventRules.fields],
    "deliverable-packages": [...DeliverablePackageRules.fields],
  };
  if (Object.keys(input).some((k) => !editable[resource]?.includes(k)))
    fail(400, "Unknown or read-only field.");
  const next = {
    ...(current ?? record(projectId, {})),
    ...input,
    updated_at: new Date().toISOString(),
  } as StoredRecord;
  if (
    ["calendar-events", "comments", "deliverable-packages"].includes(resource)
  )
    for (const field of editable[resource]) {
      if (field !== "document_ids" && typeof next[field] !== "string")
        fail(422, field + ": expected text.");
    }
  if (resource === "calendar-events") CalendarEventRules.validate(next);
  if (resource === "comments") {
    if (current) fail(405, "Comments are immutable. Add a follow-up reply.");
    CommentRules.validate(next);
    if (
      role === "client" &&
      (next.visibility !== "client" || next.target_type === "task")
    )
      fail(403, "Choose a shared discussion.");
    const target = String(next.target_id);
    if (next.target_type === "project" && target && target !== projectId)
      fail(422, "Project reference must match this workspace.");
    if (
      next.target_type === "task" &&
      !table(db, "tasks").some(
        (t) => t.id === target && t.project_id === projectId,
      )
    )
      fail(422, "Task not found.");
    if (
      next.target_type === "document" &&
      (!table(db, "documents").some(
        (d) => d.id === target && d.project_id === projectId,
      ) ||
        (role === "client" && !canReadDocument(db, target, user.id)))
    )
      fail(422, "Document unavailable.");
    if (next.target_type === "element") {
      const plan = table(db, "blueprints").find(
        (b) => b.project_id === projectId,
      );
      if (plan) {
        const geometry = plan.geometry as Record<string, unknown>;
        const elements = [
          "walls",
          "rooms",
          "doors",
          "windows",
          "columns",
          "stairs",
        ].flatMap((k) => (geometry[k] ?? []) as { id: string }[]);
        if (!elements.some((e) => e.id === target))
          fail(422, "Element not found in the shared plan.");
      }
    }
    next.author_id = user.id;
    next.author_name = user.name;
  }
  if (resource === "task-dependencies") {
    const edges = [
      ...rows.filter((e) => e.id !== current?.id),
      next,
    ] as unknown as Dependency[];
    if (
      next.predecessor_id === next.successor_id ||
      !Number.isInteger(next.lag_days) ||
      Number(next.lag_days) < 0 ||
      Number(next.lag_days) > 365
    )
      fail(422, "Invalid dependency or lag.");
    if (
      rows.some(
        (e) =>
          e.id !== current?.id &&
          e.predecessor_id === next.predecessor_id &&
          e.successor_id === next.successor_id,
      )
    )
      fail(409, "Dependency already exists.");
    const tasks = table(db, "tasks").filter(
      (t) => t.project_id === projectId,
    ) as unknown as ScheduledTask[];
    if (
      ![next.predecessor_id, next.successor_id].every((id) =>
        tasks.some((t) => t.id === id),
      )
    )
      fail(422, "Tasks must belong to this project.");
    try {
      analyzeSchedule(tasks, edges);
    } catch (error) {
      fail(422, (error as Error).message);
    }
  }
  if (resource === "deliverable-packages") {
    DeliverablePackageRules.validate(next);
    if (
      !(next.document_ids as string[]).every((id) =>
        table(db, "documents").some(
          (d) => d.id === id && d.project_id === projectId,
        ),
      )
    )
      fail(422, "Document versions must belong to this project.");
    if (next.status !== "draft" && !(next.document_ids as string[]).length)
      fail(422, "Add a document version before sharing.");
    if (
      next.status === "approved" &&
      (next.document_ids as string[]).some(
        (id) =>
          table(db, "documents").find((d) => d.id === id)?.status !==
          "approved",
      )
    )
      fail(422, "All document versions must be approved first.");
  }
  if (resource === "blueprints") {
    if (!current && rows.length)
      fail(409, "A shared plan already exists. Reload it.");
    const geometry = next.geometry as Record<string, unknown>;
    if (
      !geometry ||
      typeof geometry !== "object" ||
      geometry.projectId !== projectId
    )
      fail(422, "Invalid plan.");
    validateSharedBlueprint(geometry);
    for (const key of ["width", "height"])
      if (
        typeof geometry[key] !== "number" ||
        !Number.isFinite(geometry[key]) ||
        Number(geometry[key]) <= 0 ||
        Number(geometry[key]) > 100000
      )
        fail(422, "Invalid plan dimensions.");
    for (const key of [
      "levels",
      "rooms",
      "walls",
      "doors",
      "windows",
      "columns",
    ])
      if (!Array.isArray(geometry[key]) || geometry[key].length > 10000)
        fail(422, "Invalid plan elements.");
  }
  const previous = current ? { ...current } : undefined;
  if (current) Object.assign(current, next);
  else all.push(next);
  publishChange(
    db,
    user,
    resource,
    current ? "updated" : "created",
    next,
    previous,
  );
  return next;
}

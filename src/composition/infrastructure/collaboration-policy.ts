import {
  table,
  record,
  type WorkspaceDatabase,
  type StoredRecord,
} from "./workspace-store";
import {
  canManage,
  type SessionUser,
  type ProjectRole,
} from "@/bounded-contexts/identity-access";
import { fail } from "@/kernel/infrastructure/http-error";
/** One permission policy serves every project resource, including direct REST requests. */
export function authorize(role: ProjectRole, resource: string, method: string) {
  if (role === "client") {
    if (
      method === "GET" &&
      [
        "projects",
        "documents",
        "approvals",
        "comments",
        "deliverable-packages",
        "blueprints",
        "notifications",
      ].includes(resource)
    )
      return;
    if (resource === "comments" && method === "POST") return;
    if (resource === "approvals" && method === "PATCH") return;
    if (resource === "notifications" && method === "PATCH") return;
    fail(403, "Your role cannot perform this action.");
  }
  if (resource === "invitations" && !canManage(role))
    fail(403, "Project management permission is required.");
  if (method === "GET") return;
  if (
    [
      "members",
      "invitations",
      "projects",
      "deliverable-packages",
      "budget-items",
      "calendar-events",
      "task-dependencies",
      "approvals",
    ].includes(resource) &&
    !canManage(role)
  )
    fail(403, "Project management permission is required.");
  if (method === "DELETE" && resource !== "comments" && !canManage(role))
    fail(403, "Only project managers can delete this resource.");
}
export function canReadDocument(
  db: WorkspaceDatabase,
  id: string,
  userId: string,
) {
  return (
    table(db, "approvals").some(
      (a) => a.document_id === id && a.reviewer_id === userId,
    ) ||
    table(db, "deliverable_packages").some(
      (p) =>
        p.status !== "draft" &&
        Array.isArray(p.document_ids) &&
        p.document_ids.includes(id),
    )
  );
}
export function visibleRows(
  db: WorkspaceDatabase,
  resource: string,
  rows: StoredRecord[],
  role: ProjectRole,
  userId: string,
) {
  if (resource === "notifications")
    return rows.filter((n) => n.user_id === userId);
  if (role !== "client") return rows;
  if (resource === "documents")
    return rows.filter((d) => canReadDocument(db, d.id, userId));
  if (resource === "approvals")
    return rows.filter((a) => a.reviewer_id === userId);
  if (resource === "deliverable-packages")
    return rows.filter((p) => p.status !== "draft");
  if (resource === "comments")
    return rows.filter(
      (c) =>
        c.visibility === "client" &&
        (c.target_type !== "document" ||
          canReadDocument(db, String(c.target_id), userId)),
    );
  return rows;
}
/** Audit snapshots omit binary geometry/file payloads; notification recipients follow resource visibility. */
export function publishChange(
  db: WorkspaceDatabase,
  user: SessionUser,
  resource: string,
  action: string,
  row: StoredRecord,
  previous?: StoredRecord,
) {
  const omit = new Set([
    "file_data",
    "geometry",
    "token_hash",
    "password_hash",
    "updated_at",
  ]);
  const changes = Object.fromEntries(
    Object.keys(row)
      .filter(
        (key) =>
          !omit.has(key) &&
          JSON.stringify(row[key]) !== JSON.stringify(previous?.[key]),
      )
      .map((key) => [
        key,
        { before: previous?.[key] ?? null, after: row[key] },
      ]),
  );
  table(db, "activities").push(
    record(row.project_id, {
      title: String(row.title ?? row.name ?? row.content ?? resource).slice(
        0,
        200,
      ),
      action,
      actor_id: user.id,
      actor_name: user.name,
      resource,
      resource_id: row.id,
      changes,
    }),
  );
  if (
    ["notifications", "invitations", "members", "blueprints"].includes(resource)
  )
    return;
  for (const member of table(db, "members").filter(
    (m) => m.project_id === row.project_id && m.user_id !== user.id,
  )) {
    if (
      member.role === "client" &&
      !(
        (resource === "approvals" && row.reviewer_id === member.user_id) ||
        (resource === "comments" && row.visibility === "client") ||
        (resource === "deliverable-packages" && row.status !== "draft")
      )
    )
      continue;
    table(db, "notifications").push(
      record(row.project_id, {
        user_id: member.user_id,
        title: String(row.title ?? row.content ?? resource).slice(0, 200),
        resource,
        resource_id: row.id,
        read_at: "",
        actor_name: user.name,
      }),
    );
  }
}

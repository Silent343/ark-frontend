# Workspace REST contract — v1

This API is a local prototype served by Next.js Route Handlers in the Node runtime. It requires a writable filesystem and a single server process. It is not an authenticated production API.

## Resource naming

Web and API paths use English plural nouns in kebab-case. JSON collections and fields use English snake_case; TypeScript types/classes use PascalCase and variables use camelCase. Existing design models retain camelCase through explicit DTO mapping.

| Web resource                          | API path                                     | JSON collection |
| ------------------------------------- | -------------------------------------------- | --------------- |
| `/projects`                           | `/api/v1/projects`                           | `projects`      |
| `/projects/{project_id}/tasks`        | `/api/v1/projects/{project_id}/tasks`        | `tasks`         |
| `/projects/{project_id}/milestones`   | `/api/v1/projects/{project_id}/milestones`   | `milestones`    |
| `/projects/{project_id}/documents`    | `/api/v1/projects/{project_id}/documents`    | `documents`     |
| `/projects/{project_id}/issues`       | `/api/v1/projects/{project_id}/issues`       | `issues`        |
| `/projects/{project_id}/budget-items` | `/api/v1/projects/{project_id}/budget-items` | `budget_items`  |
| `/projects/{project_id}/approvals`    | `/api/v1/projects/{project_id}/approvals`    | `approvals`     |
| Activity in project overview          | `/api/v1/projects/{project_id}/activities`   | `activities`    |

`editor`, `model`, and `simulation` are existing project tool routes, not CRUD collections. Account/profile/preferences remain browser-local and have not been migrated to REST in this stage.

## Methods and representations

- Collection: `GET` lists records, `POST` creates a record and returns `201` with `Location`.
- Item: append `/{id}`; `GET` reads, `PATCH` updates allowed fields, `DELETE` returns `204`.
- Projects support collection GET/POST and item GET/PATCH; project deletion is intentionally unavailable.
- Activities are read-only; collection GET returns the latest twelve events for the project.
- Successful JSON responses are `{ "data": ... }`. Errors are `{ "error": { "code": 422, "message": "..." } }`.
- Every resource has server-owned `id`, `project_id`, `created_at`, and `updated_at` fields. Dates use `YYYY-MM-DD`; timestamps use UTC ISO 8601.
- Individual records return an `ETag` containing quoted `updated_at`. Send that value in `If-Match` for PATCH/DELETE. Missing revision returns `428`; stale revision returns `409`. The prototype also accepts an unquoted timestamp for legacy clients.
- Unknown/read-only payload fields return `400`; invalid scalar types/domain values return `422`; missing or cross-project resources return `404`; unsupported methods return `405`.
- No pagination, authentication, authorization, server-side search, exchange conversion, or cross-device collaboration is provided yet.

## Example task

```http
POST /api/v1/projects/casa-aguilas-chiapas/tasks
Content-Type: application/json

{
  "title": "Review entrance circulation",
  "description": "Check the proposed access width.",
  "assignee": "Design team",
  "discipline": "architecture",
  "due_date": "2026-09-30",
  "priority": "high",
  "status": "todo"
}
```

Send a partial object such as `{ "status": "done" }` to the returned item URL with PATCH and its current ETag. Domain field allowlists live beside each context's resource type.

## Version and relationship rules

Document uploads accept PDF, PNG, JPEG, and WebP up to 3 MiB. Files are encoded in `file_data` for the local JSON prototype. New documents start at `version: 1`; a successor uses `previous_version_id` and predecessor version plus one. File payload/name/type and version identity cannot be replaced by PATCH. A predecessor cannot have two successors, and referenced versions cannot be deleted.

Approval `document_id` must belong to the same project. Decisions require reviewer and feedback and update only the referenced document version. Names are recorded assertions, not authenticated signatures. Issues may retain a semantic `element_id`; the API cannot validate that browser-local element, so the editor link must be reviewed if the plan changes.

Budget planned totals are `quantity * unit_cost`; `actual_cost` is manually recorded. All lines inherit the project's selected currency. Changing the currency changes denomination, not exchange value. Area-based quantities are optional estimates captured from the current local plan; they do not auto-update after editing.

Project `phase` values are `proposal`, `design`, `review`, `construction`, `delivered`. Existing design `status` values (`Ready`, `Processing`, `Draft`) are retained for compatibility and are distinct from management phase. Portfolio progress is derived from completed tasks, not the old synthetic progress field.

> Stage 2 supersedes the original local-only authentication and JSON-storage notes below. The API now requires a session, project membership and optimistic revision checks. Writable storage is SQLite; see `stage-two.md`.

## Stage 2 resources

All JSON responses use `{ data }` or `{ error: { code, message } }`. Resource collections use plural kebab-case URLs; payload and database fields use snake_case, except the legacy semantic geometry inside `geometry`.

| Endpoint                                            | Methods            | Purpose                                         |
| --------------------------------------------------- | ------------------ | ----------------------------------------------- |
| `/api/v1/users`                                     | POST               | Register local account                          |
| `/api/v1/sessions`                                  | GET, POST, DELETE  | Session/setup state, login, logout              |
| `/api/v1/invitations/{token}`                       | GET, POST          | Inspect invitation, accept as matching account  |
| `/api/v1/projects/{project_id}/members/{member_id}` | GET, PATCH, DELETE | Membership and role management                  |
| `…/invitations`                                     | GET, POST          | List metadata; create expiring invitation link  |
| `…/invitations/{invitation_id}`                     | PATCH              | Revoke pending invitation                       |
| `…/calendar-events`                                 | GET, POST          | Project appointments                            |
| `…/task-dependencies`                               | GET, POST          | Finish-to-start links with `lag_days`           |
| `…/comments`                                        | GET, POST          | Authored discussions with visibility and target |
| `…/deliverable-packages`                            | GET, POST          | Stage packages with `document_ids`              |
| `…/change-log`                                      | GET                | Immutable actor and before/after history        |
| `…/notifications`                                   | GET                | Only the signed-in recipient's records          |
| `…/notifications/{notification_id}`                 | PATCH              | Mark read                                       |
| `…/blueprints`                                      | GET, POST          | Shared semantic aggregate                       |
| `…/blueprints/{blueprint_id}`                       | PATCH              | Save geometry with revision check               |
| `…/reports?locale=es`                               | GET                | Download A4 project-status PDF                  |

Calendar events, dependencies and packages support GET/PATCH/DELETE at their item URLs. Comments cannot be edited; authors/managers can delete and add follow-up comments. Change log entries cannot be modified. Mutations require `If-Match` containing `updated_at`; missing revisions return 428, stale revisions 409. Registration, creation and invitation acceptance do not require an existing revision. Sessions use an HttpOnly SameSite cookie. A client cannot query internal tasks, costs, team lists or change history, and can decide only assigned reviews. The server ignores caller identity claims and stamps the actual session author.

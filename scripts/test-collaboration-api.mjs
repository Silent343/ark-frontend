import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
const base = process.env.ARK_TEST_URL ?? "http://127.0.0.1:3010";
const password = "QA-only-passphrase-2026";
const stamp = Date.now();
async function api(
  path,
  { method = "GET", body, cookie = "", version, origin } = {},
) {
  const response = await fetch(base + "/api/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(version ? { "If-Match": JSON.stringify(version) } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = response.status === 204 ? {} : await response.json();
  return {
    status: response.status,
    data: json.data,
    error: json.error,
    headers: response.headers,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
function expect(result, status) {
  assert.equal(result.status, status, JSON.stringify(result.error));
  return result.data;
}
const probe = await api("/sessions");
assert.equal(
  probe.headers.get("x-ark-test-mode"),
  "1",
  "Refusing to write outside isolated QA storage.",
);
async function account(label) {
  const email = label + "-" + stamp + "@ark.test";
  const response = await api("/users", {
    method: "POST",
    body: { email, password, name: "QA " + label },
  });
  const { user } = expect(response, 201);
  assert(!("password_hash" in user));
  assert(response.headers.get("set-cookie").includes("HttpOnly"));
  return { user, cookie: response.cookie, email };
}
const owner = await account("owner"),
  client = await account("client"),
  collaborator = await account("collaborator"),
  outsider = await account("outsider");
const project = expect(
  await api("/projects", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      name: "Stage 2 QA " + stamp,
      location: "Lima",
      floors: 1,
      floor_height: 2.8,
      structure_type: "Reinforced concrete",
      soil_type: "Dense sand",
    },
  }),
  201,
);
const root = "/projects/" + project.id;
const call = (suffix, options = {}) =>
  api(root + suffix, { cookie: owner.cookie, ...options });
expect(await api("/projects"), 401);
expect(await call("", { cookie: outsider.cookie }), 404);
assert.equal(
  expect(await api("/projects", { cookie: client.cookie }), 200).length,
  0,
);
expect(
  await call("/tasks", {
    method: "POST",
    body: {},
    origin: "https://untrusted.example",
  }),
  403,
);
expect(await call("/tasks", { method: "POST", body: {}, origin: base }), 422);
async function invite(account, role) {
  const response = expect(
    await call("/invitations", {
      method: "POST",
      body: { email: account.email, role },
    }),
    201,
  );
  const token = new URL(response.invitation_url).pathname.split("/").pop();
  expect(
    await api("/invitations/" + token, {
      method: "POST",
      cookie: outsider.cookie,
      body: {},
    }),
    403,
  );
  expect(
    await api("/invitations/" + token, {
      method: "POST",
      cookie: account.cookie,
      body: {},
    }),
    200,
  );
  expect(
    await api("/invitations/" + token, {
      method: "POST",
      cookie: account.cookie,
      body: {},
    }),
    404,
  );
}
await invite(client, "client");
await invite(collaborator, "collaborator");
const clientProject = expect(await call("", { cookie: client.cookie }), 200);
assert.equal(clientProject.role, "client");
assert(!("budget_total" in clientProject));
for (const resource of [
  "tasks",
  "budget-items",
  "change-log",
  "members",
  "invitations",
])
  expect(await call("/" + resource, { cookie: client.cookie }), 403);
expect(
  await call("/budget-items", {
    method: "POST",
    cookie: collaborator.cookie,
    body: {},
  }),
  403,
);
const taskBody = {
  title: "Survey existing conditions",
  description: "QA dependency",
  assignee: owner.user.name,
  assignee_id: owner.user.id,
  start_date: "2026-09-10",
  due_date: "2026-09-12",
  status: "todo",
  priority: "high",
  discipline: "architecture",
};
let predecessor = expect(
  await call("/tasks", { method: "POST", body: taskBody }),
  201,
);
let successor = expect(
  await call("/tasks", {
    method: "POST",
    body: {
      ...taskBody,
      title: "Develop design",
      assignee: collaborator.user.name,
      assignee_id: collaborator.user.id,
    },
  }),
  201,
);
const edge = expect(
  await call("/task-dependencies", {
    method: "POST",
    body: {
      predecessor_id: predecessor.id,
      successor_id: successor.id,
      lag_days: 1,
    },
  }),
  201,
);
expect(
  await call("/task-dependencies", {
    method: "POST",
    body: {
      predecessor_id: successor.id,
      successor_id: predecessor.id,
      lag_days: 0,
    },
  }),
  422,
);
expect(
  await call("/tasks/" + successor.id, {
    method: "PATCH",
    body: { status: "in_progress" },
    version: successor.updated_at,
  }),
  409,
);
predecessor = expect(
  await call("/tasks/" + predecessor.id, {
    method: "PATCH",
    body: { status: "done" },
    version: predecessor.updated_at,
  }),
  200,
);
successor = expect(
  await call("/tasks/" + successor.id, {
    method: "PATCH",
    cookie: collaborator.cookie,
    body: { status: "in_progress" },
    version: successor.updated_at,
  }),
  200,
);
const event = expect(
  await call("/calendar-events", {
    method: "POST",
    body: {
      title: "Design workshop",
      start_at: "2026-09-20T15:00:00Z",
      end_at: "2026-09-20T16:00:00Z",
      owner: owner.user.name,
      category: "meeting",
      location: "Studio",
      notes: "QA workshop",
    },
  }),
  201,
);
expect(
  await call("/calendar-events/" + event.id, {
    method: "PATCH",
    body: { end_at: "2026-09-19T15:00:00Z" },
    version: event.updated_at,
  }),
  422,
);
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM3sAAAAASUVORK5CYII=";
const docInput = {
  title: "Ground floor plan",
  discipline: "architecture",
  status: "draft",
  notes: "QA version",
  file_name: "plan.png",
  file_data: png,
  mime_type: "image/png",
  version: 1,
  previous_version_id: "",
};
const doc = expect(
  await call("/documents", { method: "POST", body: docInput }),
  201,
);
const privateDoc = expect(
  await call("/documents", {
    method: "POST",
    body: { ...docInput, title: "Internal study" },
  }),
  201,
);
assert.equal(
  expect(await call("/documents", { cookie: client.cookie }), 200).length,
  0,
);
const approval = expect(
  await call("/approvals", {
    method: "POST",
    body: {
      title: "Review ground floor",
      description: "Version 1 review",
      document_id: doc.id,
      reviewer: client.user.name,
      reviewer_id: client.user.id,
      status: "pending",
      feedback: "",
      decided_at: "",
    },
  }),
  201,
);
assert.equal(
  expect(await call("/documents", { cookie: client.cookie }), 200).length,
  1,
);
expect(
  await call("/documents/" + privateDoc.id, { cookie: client.cookie }),
  404,
);
expect(
  await call("/approvals/" + approval.id, {
    method: "PATCH",
    body: { status: "approved", feedback: "Impersonation" },
    version: approval.updated_at,
  }),
  403,
);
const approved = expect(
  await call("/approvals/" + approval.id, {
    method: "PATCH",
    cookie: client.cookie,
    body: { status: "approved", feedback: "Accepted QA layout" },
    version: approval.updated_at,
  }),
  200,
);
assert.equal(approved.reviewer, client.user.name);
assert.equal(approved.decided_by, client.user.id);
expect(
  await call("/approvals/" + approval.id, {
    method: "PATCH",
    cookie: client.cookie,
    body: { reviewer_id: owner.user.id },
    version: approved.updated_at,
  }),
  403,
);
expect(
  await call("/deliverable-packages", {
    method: "POST",
    body: {
      title: "Design delivery",
      stage: "design",
      due_date: "2026-09-30",
      status: "approved",
      document_ids: [doc.id],
    },
  }),
  201,
);
assert.equal(
  expect(await call("/deliverable-packages", { cookie: client.cookie }), 200)
    .length,
  1,
);
expect(
  await call("/deliverable-packages", {
    method: "POST",
    body: {
      title: "Premature delivery",
      stage: "design",
      due_date: "2026-09-30",
      status: "approved",
      document_ids: [privateDoc.id],
    },
  }),
  422,
);
const comment = expect(
  await call("/comments", {
    method: "POST",
    cookie: client.cookie,
    body: {
      content: "Please preserve the courtyard",
      target_type: "document",
      target_id: doc.id,
      visibility: "client",
    },
  }),
  201,
);
assert.equal(comment.author_id, client.user.id);
expect(
  await call("/comments", {
    method: "POST",
    cookie: client.cookie,
    body: {
      content: "Attempt",
      target_type: "task",
      target_id: predecessor.id,
      visibility: "client",
    },
  }),
  403,
);
const deleted = expect(
  await call("/comments", {
    method: "POST",
    body: {
      content: "Disposable test comment",
      target_type: "project",
      target_id: project.id,
      visibility: "team",
    },
  }),
  201,
);
expect(
  await call("/comments/" + deleted.id, {
    method: "DELETE",
    version: deleted.updated_at,
  }),
  204,
);
assert(!expect(await call("/comments"), 200).some((c) => c.id === deleted.id));
const notifications = expect(
  await call("/notifications", { cookie: client.cookie }),
  200,
);
assert(notifications.length > 0);
assert(notifications.every((n) => n.user_id === client.user.id));
expect(
  await call("/notifications/" + notifications[0].id, {
    cookie: outsider.cookie,
  }),
  404,
);
const read = expect(
  await call("/notifications/" + notifications[0].id, {
    method: "PATCH",
    cookie: client.cookie,
    body: { read_at: "" },
    version: notifications[0].updated_at,
  }),
  200,
);
assert(read.read_at);
const changes = expect(await call("/change-log"), 200);
assert(
  changes.some(
    (c) => c.actor_id === client.user.id && c.resource === "approvals",
  ),
);
assert(!JSON.stringify(changes).includes("token_hash"));
const seed = JSON.parse(await readFile(new URL("../public/db.json", import.meta.url), "utf8")),
  geometry = { ...seed.blueprint, projectId: project.id };
const plan = expect(
  await call("/blueprints", { method: "POST", body: { geometry } }),
  201,
);
expect(
  await call("/blueprints/" + plan.id, {
    method: "PATCH",
    version: plan.updated_at,
    body: { geometry: { ...geometry, walls: [{ id: "broken" }] } },
  }),
  422,
);
expect(
  await call("/blueprints/" + plan.id, {
    method: "PATCH",
    cookie: client.cookie,
    version: plan.updated_at,
    body: { geometry },
  }),
  403,
);
const revised = expect(
  await call("/blueprints/" + plan.id, {
    method: "PATCH",
    version: plan.updated_at,
    body: { geometry: { ...geometry, width: geometry.width + 10 } },
  }),
  200,
);
expect(
  await call("/blueprints/" + plan.id, {
    method: "PATCH",
    version: plan.updated_at,
    body: { geometry },
  }),
  409,
);
assert.equal(
  expect(await call("/blueprints", { cookie: client.cookie }), 200)[0].geometry
    .width,
  revised.geometry.width,
);
const report = await fetch(base + "/api/v1" + root + "/reports", {
  headers: { Cookie: owner.cookie },
});
assert.equal(report.status, 200);
const pdf = await PDFDocument.load(await report.arrayBuffer());
assert(pdf.getPageCount() >= 1);
const forbiddenReport = await fetch(base + "/api/v1" + root + "/reports", {
  headers: { Cookie: client.cookie },
});
assert.equal(forbiddenReport.status, 403);
expect(
  await call("/task-dependencies/" + edge.id, {
    method: "DELETE",
    version: edge.updated_at,
  }),
  204,
);
assert.equal(expect(await call("/task-dependencies"), 200).length, 0);
expect(
  await api("/sessions", { method: "DELETE", cookie: outsider.cookie }),
  200,
);
expect(await call("", { cookie: outsider.cookie }), 401);
const login = expect(
  await api("/sessions", {
    method: "POST",
    body: { email: owner.email, password },
  }),
  200,
);
assert.equal(login.user.id, owner.user.id);
console.log(
  "PASS: authentication, project isolation, roles, invitations, dependency cycles/blocking, calendar validation, private documents, client reviews, immutable authors, packages, notifications, audit, PDF and logout.",
);
console.log("QA UI account: " + owner.email + " | project: " + project.id);

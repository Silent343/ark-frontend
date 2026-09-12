import assert from "node:assert/strict";
const base = process.env.TELURIA_TEST_URL ?? "http://127.0.0.1:3010";
let cookie="";
/** Run against an isolated server started with TELURIA_TEST_MODE=1. */
async function call(path, method = "GET", body, version) {
  const response = await fetch(base + "/api/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie:cookie,
      ...(version ? { "If-Match": JSON.stringify(version) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if(response.headers.get("set-cookie"))cookie=response.headers.get("set-cookie").split(";")[0];
  const result = response.status === 204 ? {} : await response.json();
  return {
    status: response.status,
    data: result.data,
    error: result.error,
    headers: response.headers,
  };
}
function expected(result, status) {
  assert.equal(result.status, status, JSON.stringify(result.error));
  return result.data;
}
// Verify isolation before the first mutation, even if a custom test URL was supplied.
const probe = await call("/sessions");
assert.equal(
  probe.headers.get("x-teluria-test-mode"),
  "1",
  "Refusing to write: start the server with TELURIA_TEST_MODE=1.",
);
const identity=expected(await call("/users","POST",{name:"QA Architect",email:"qa-"+Date.now()+"@teluria.test",password:"QA-only-passphrase-2026"}),201).user;
const projectInput = {
  name: "QA architecture " + Date.now(),
  location: "Lima",
  floors: 1,
  floor_height: 2.8,
  structure_type: "Reinforced concrete",
  soil_type: "Dense sand",
};
const project = expected(await call("/projects", "POST", projectInput), 201);
const other = expected(
  await call("/projects", "POST", {
    ...projectInput,
    name: "QA isolated project",
  }),
  201,
);
const root = "/projects/" + project.id;
assert.equal((await call(root + "/tasks")).data.length, 0);
const taskInput = {
  title: "Review plan",
  description: "Source geometry",
  status: "todo",
  priority: "high",
  assignee: "Test architect",
  due_date: "2026-09-30",
  discipline: "architecture",
};
const task = expected(await call(root + "/tasks", "POST", taskInput), 201);
expected(
  await call(
    root + "/tasks/" + task.id,
    "PATCH",
    { status: "done" },
    task.updated_at,
  ),
  200,
);
expected(
  await call(
    root + "/tasks/" + task.id,
    "PATCH",
    { status: "review" },
    task.updated_at,
  ),
  409,
);
expected(await call("/projects/" + other.id + "/tasks/" + task.id), 404);
expected(
  await call(root + "/tasks", "POST", { ...taskInput, due_date: "2026-02-30" }),
  422,
);
expected(
  await call(root + "/tasks", "POST", {
    ...taskInput,
    title: { danger: true },
  }),
  422,
);
expected(
  await call(root + "/tasks", "POST", { ...taskInput, project_id: other.id }),
  400,
);
const cost = {
  title: "Floor finishes",
  category: "finishes",
  quantity: 12.5,
  unit: "m²",
  unit_cost: 120,
  actual_cost: 600,
};
const item = expected(await call(root + "/budget-items", "POST", cost), 201);
expected(
  await call(root + "/budget-items", "POST", { ...cost, quantity: -1 }),
  422,
);
expected(
  await call(
    root + "/budget-items/" + item.id,
    "PATCH",
    { unit_cost: 0 },
    item.updated_at,
  ),
  200,
);
expected(
  await call(root + "/milestones", "POST", {
    title: "Delivery",
    owner: "Architect",
    start_date: "2026-10-20",
    due_date: "2026-10-01",
    status: "planned",
  }),
  422,
);
expected(
  await call(root + "/milestones", "POST", {
    title: "Delivery",
    owner: "Architect",
    start_date: "2026-10-01",
    due_date: "2026-10-20",
    status: "planned",
  }),
  201,
);
const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3foAAAAASUVORK5CYII=";
const docInput = {
  title: "Plan",
  discipline: "architecture",
  version: 1,
  status: "in_review",
  file_name: "plan.png",
  file_data: pixel,
  mime_type: "image/png",
  notes: "Test version",
  previous_version_id: "",
};
const doc = expected(await call(root + "/documents", "POST", docInput), 201);
expected(
  await call(
    root + "/documents/" + doc.id,
    "PATCH",
    { file_data: pixel + "x" },
    doc.updated_at,
  ),
  409,
);
const doc2 = expected(
  await call(root + "/documents", "POST", {
    ...docInput,
    version: 2,
    previous_version_id: doc.id,
  }),
  201,
);
expected(
  await call(root + "/documents", "POST", {
    ...docInput,
    version: 2,
    previous_version_id: doc.id,
  }),
  409,
);
const approvalInput = {
  title: "Review layout",
  description: "Version-specific decision",
  document_id: doc.id,
  status: "pending",
  reviewer: "QA Architect",
  reviewer_id: identity.id,
  feedback: "",
  decided_at: "",
};
expected(
  await call("/projects/" + other.id + "/approvals", "POST", approvalInput),
  422,
);
const approval = expected(
  await call(root + "/approvals", "POST", approvalInput),
  201,
);
expected(
  await call(
    root + "/approvals/" + approval.id,
    "PATCH",
    { status: "approved", feedback: "Accepted" },
    approval.updated_at,
  ),
  200,
);
assert.equal(
  (await call(root + "/documents/" + doc.id)).data.status,
  "approved",
);
assert.equal(
  (await call(root + "/documents/" + doc2.id)).data.status,
  "in_review",
);
expected(
  await call(
    root + "/documents/" + doc.id,
    "DELETE",
    undefined,
    (await call(root + "/documents/" + doc.id)).data.updated_at,
  ),
  409,
);
const issue = expected(
  await call(root + "/issues", "POST", {
    title: "Check wall",
    description: "Review connection",
    status: "open",
    priority: "medium",
    assignee: "Architect",
    due_date: "2026-09-30",
    element_id: "wall-west",
  }),
  201,
);
expected(await call(root + "/issues/" + issue.id, "DELETE"), 428);
expected(
  await call(
    root + "/issues/" + issue.id,
    "DELETE",
    undefined,
    issue.updated_at,
  ),
  204,
);
const parallel = await Promise.all(
  Array.from({ length: 5 }, (_, i) =>
    call(root + "/tasks", "POST", {
      ...taskInput,
      title: "Concurrent task " + i,
    }),
  ),
);
parallel.forEach((r) => expected(r, 201));
assert.equal((await call(root + "/tasks")).data.length, 6);
const list = expected(await call("/projects"), 200);
const summary = list.find((p) => p.id === project.id).management;
assert.equal(summary.progress, 17);
assert.equal(summary.task_count, 6);
assert.equal(summary.budget_actual, 600);
assert.ok((await call(root + "/activities")).data.length > 0);
expected(await call("/projects/missing-project/tasks"), 404);
console.log(
  "PASS: REST persistence, isolation, validation, optimistic concurrency, document versions, approvals, budget totals, audit and concurrent writes.",
);
console.log("QA_PROJECT_ID=" + project.id);

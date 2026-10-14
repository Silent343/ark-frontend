import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import {
  detectNeuralPlan,
  neuralStatus,
} from "../../teluria-backend/src/modules/plan-digitization/infrastructure/neural-detector.js";
import { validateCadPlan } from "../../teluria-backend/src/modules/plan-digitization/domain/cad-plan.js";
// Opt-in local technical smoke. No ground truth, no source/project writes, no network inference.
const sourcePath = process.argv[2];
if (!sourcePath)
  throw new Error(
    "Pass an exported Blueprint JSON containing CAD and one calibrated region.",
  );
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
assert(
  source.cad?.unitConfirmed,
  "This smoke requires confirmed/provisional test units explicitly recorded in the source snapshot.",
);
const modelId = "cubicasa-multitask-v1";
assert(neuralStatus().models.some((m) => m.id === modelId && m.available));
let geometry = {
    ...source,
    projectId: "neural-cad-smoke",
    cad: { ...source.cad, neural: [] },
  },
  requests = 0;
const output = path.resolve(".data/qa/neural-cad-smoke");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const project = {
  id: geometry.projectId,
  name: "CAD real · prueba técnica neuronal",
  location: "Lima",
  floors: 1,
  floor_height: 2.8,
  structure_type: "Reinforced concrete",
  soil_type: "Dense sand",
  role: "owner",
  phase: "Design",
  progress: 0,
  updated_at: new Date().toISOString(),
};
await context.route("**/api/v1/**", async (route) => {
  const pathname = new URL(route.request().url()).pathname,
    method = route.request().method();
  let data = [];
  try {
    if (pathname.endsWith("/sessions"))
      data = { user: { id: "qa", name: "QA Architect", email: "qa@ark.test" } };
    else if (pathname.endsWith("/projects")) data = [project];
    else if (pathname.endsWith("/neural-cad-smoke")) data = project;
    else if (pathname.endsWith("/plan-detection")) {
      if (method === "GET")
        data = { ...neuralStatus(), model: { id: modelId } };
      else {
        requests++;
        const body = route.request().postDataJSON();
        data = await detectNeuralPlan(body.image, body.modelId);
      }
    } else if (pathname.includes("/blueprints")) {
      if (method !== "GET") {
        geometry = route.request().postDataJSON().geometry;
        validateCadPlan(geometry.cad);
      }
      const record = {
        id: "plan-smoke",
        updated_at: new Date().toISOString(),
        geometry,
      };
      data = method === "GET" ? [record] : record;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  } catch (error) {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: error.message } }),
    });
  }
});
try {
  await page.goto(
    (process.env.ARK_TEST_URL ?? "http://127.0.0.1:3015") +
      "/projects/neural-cad-smoke/editor?mode=edit&panel=recognition",
  );
  const panel = page.getByRole("region", { name: "Reconocimiento neuronal" });
  await panel.waitFor({ timeout: 90_000 });
  await panel.getByRole("combobox").nth(2).selectOption(".05");
  await panel
    .getByRole("button", { name: "Analizar con IA", exact: true })
    .click();
  await panel.locator(".neural-mask-preview").waitFor({ timeout: 240_000 });
  await page.waitForFunction(
    () => document.querySelector(".cad-save-state")?.textContent === "Guardado",
    {},
    { timeout: 120_000 },
  );
  const a = geometry.cad.neural[0];
  assert(a?.tiling?.complete);
  assert.equal(a.model.id, modelId);
  assert(!a.applied);
  assert(a.openings.every((i) => !i.approved));
  assert(a.fixtures.every((i) => !i.approved));
  const report = {
    file: path.basename(sourcePath),
    purpose:
      "integration smoke; scale from existing technical fixture, not ground truth",
    requests,
    walls: a.walls.length,
    openings: a.openings.length,
    hosted: a.openings.filter((i) => i.hostStatus === "hosted").length,
    objects: Object.fromEntries(
      [...new Set(a.fixtures.map((i) => i.kind))].map((kind) => [
        kind,
        a.fixtures.filter((i) => i.kind === kind).length,
      ]),
    ),
    elapsedMs: a.elapsedMs,
    tiling: a.tiling,
    model: a.model,
    errors,
  };
  fs.writeFileSync(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await page.screenshot({
    path: path.join(output, "real-cad-proposals.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report));
} catch (error) {
  await page.screenshot({
    path: path.join(output, "failure.png"),
    fullPage: true,
  });
  console.error((await page.locator("body").innerText()).slice(-5000));
  throw error;
} finally {
  await browser.close();
}

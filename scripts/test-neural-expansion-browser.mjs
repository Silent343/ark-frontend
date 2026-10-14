import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { loadDomain } from "./lib/domain-loader.mjs";
const domain = "src/bounded-contexts/plan-digitization/domain/";
const { createCadPlan, compileCadBlueprint } = loadDomain(
  domain + "cad-operations",
);
const { EXPANDED_NEURAL_CLASSES } = loadDomain(domain + "neural-contract");
const { validateBlueprint } =
  await import("../../teluria-backend/src/modules/plan-digitization/domain/blueprint.js");
const base = process.env.ARK_TEST_URL ?? "http://127.0.0.1:3015",
  output = path.resolve(".data/qa/neural-expansion-browser");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cad = createCadPlan(
  "neural-fixture.dwg",
  [
    {
      id: "edge",
      kind: "path",
      layer: "WALL",
      role: "wall",
      color: "#222222",
      points: [0.1, 2, 7.9, 2],
      closed: false,
    },
  ],
  [{ name: "WALL", role: "wall", count: 1, visible: true }],
  {},
);
cad.metersPerCadUnit = 1;
cad.unitConfirmed = true;
cad.bounds = { minX: 0, minY: 0, maxX: 8, maxY: 4 };
cad.regions = [
  {
    id: "floor",
    name: "Planta baja",
    minX: 0,
    minY: 0,
    maxX: 8,
    maxY: 4,
    enabled: true,
    repeat: 1,
    elevation: 0,
    wallHeight: 3,
    viewType: "plan",
  },
];
const seed = JSON.parse(fs.readFileSync("public/db.json", "utf8")).blueprint;
let geometry = compileCadBlueprint(
  { ...seed, projectId: "neural-qa", sheets: [], correspondences: [] },
  cad,
);
const project = {
  id: "neural-qa",
  name: "QA neuronal",
  location: "Lima",
  floors: 1,
  floor_height: 3,
  structure_type: "Reinforced concrete",
  soil_type: "Dense sand",
  role: "owner",
  phase: "Design",
  progress: 0,
  updated_at: new Date().toISOString(),
};
const model = {
  id: "cubicasa-multitask-v1",
  revision: "a".repeat(40),
  checkpointSha256: "b".repeat(64),
  artifactSha256: "c".repeat(64),
  classes: EXPANDED_NEURAL_CLASSES,
  usage: "experimental-research",
};
let requests = 0,
  overlay = "",
  saved = 0;
await context.route("**/api/v1/**", async (route) => {
  const pathname = new URL(route.request().url()).pathname,
    method = route.request().method();
  let data = [];
  if (pathname.endsWith("/sessions"))
    data = { user: { id: "qa", name: "QA Architect", email: "qa@ark.test" } };
  else if (pathname.endsWith("/projects")) data = [project];
  else if (pathname.endsWith("/neural-qa")) data = project;
  else if (pathname.endsWith("/plan-detection")) {
    if (method === "GET")
      data = {
        available: true,
        model,
        models: [
          {
            id: model.id,
            label: "CubiCasa · arquitectura y equipamiento",
            classes: model.classes,
            available: true,
          },
        ],
      };
    else {
      assert.equal(route.request().postDataJSON().modelId, model.id);
      const tileX = requests++ === 0 ? 0 : 288,
        mask = Buffer.alloc(512 * 512),
        scores = Buffer.alloc(mask.length, 255),
        counts = Array(13).fill(0);
      for (let y = 0; y < 512; y++)
        for (let x = 0; x < 512; x++) {
          const gx = tileX + x,
            i = y * 512 + x;
          if (y >= 195 && y < 205 && gx >= 10 && gx < 790) mask[i] = 1;
          if (y >= 190 && y < 210 && gx >= 250 && gx < 330) mask[i] = 2;
          if (y >= 250 && y < 300 && gx >= 400 && gx < 450) mask[i] = 7;
          counts[mask[i]]++;
        }
      data = {
        width: 512,
        height: 512,
        mask: mask.toString("base64"),
        scores: scores.toString("base64"),
        model,
        elapsedMs: 10,
        counts,
        overlay,
      };
    }
  } else if (pathname.includes("/blueprints")) {
    if (method !== "GET") {
      geometry = route.request().postDataJSON().geometry;
      validateBlueprint(geometry, "neural-qa");
      saved++;
    }
    const record = {
      id: "plan-qa",
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
});
try {
  await page.goto(
    base + "/projects/neural-qa/editor?mode=edit&panel=recognition",
  );
  const panel = page.getByRole("region", { name: "Reconocimiento neuronal" });
  await panel.waitFor({ timeout: 90_000 });
  overlay = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const x = c.getContext("2d");
    x.fillStyle = "#fffefa";
    x.fillRect(0, 0, 512, 512);
    return c.toDataURL("image/png");
  });
  await panel.getByRole("combobox").nth(2).selectOption(".01");
  await panel
    .getByRole("button", { name: "Analizar con IA", exact: true })
    .click();
  await panel
    .getByText("1 segmentos · 1 aberturas · 1 objetos", { exact: false })
    .waitFor({ timeout: 90_000 });
  assert.equal(requests, 2);
  await page.waitForFunction(
    () => document.querySelector(".cad-save-state")?.textContent === "Guardado",
    {},
    { timeout: 60_000 },
  );
  assert.equal(geometry.cad.neural[0].tiling.tileCount, 2);
  await panel
    .locator("summary")
    .filter({ hasText: "Revisar aberturas" })
    .click();
  const door = panel.getByRole("checkbox", { name: /Aprobar Puertas/ });
  assert(await door.isDisabled(), "approval requires an explicit height");
  await panel.getByRole("spinbutton", { name: /Altura Puertas/ }).fill("2.1");
  await door.check();
  await panel
    .locator("summary")
    .filter({ hasText: "Revisar equipamiento" })
    .click();
  await panel.getByRole("spinbutton", { name: /Altura Lavabos/ }).fill("0.85");
  await panel.getByRole("checkbox", { name: /Aprobar Lavabos/ }).check();
  await panel
    .getByRole("checkbox", {
      name: "Usar la propuesta híbrida CAD + IA en el modelo 3D",
      exact: true,
    })
    .check();
  await page.waitForFunction(
    () => document.querySelector(".cad-save-state")?.textContent === "Guardado",
    {},
    { timeout: 60_000 },
  );
  assert.equal(geometry.doors.length, 1);
  assert.equal(geometry.fixtures.length, 1);
  assert(geometry.walls.some((w) => w.id === geometry.doors[0].wallId));
  await page.screenshot({
    path: path.join(output, "review-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "mobile does not overflow",
  );
  await page.screenshot({
    path: path.join(output, "review-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/projects/neural-qa/model");
  await page
    .getByRole("heading", { name: "Estudio del modelo", exact: true })
    .waitFor({ timeout: 60_000 });
  await page.screenshot({
    path: path.join(output, "model-approved.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      case: "tiled neural review",
      requests,
      saved,
      doors: geometry.doors.length,
      fixtures: geometry.fixtures.length,
      errors,
      output,
    }),
  );
} catch (error) {
  await page.screenshot({
    path: path.join(output, "failure.png"),
    fullPage: true,
  });
  console.error((await page.locator("body").innerText()).slice(-6000));
  throw error;
} finally {
  await browser.close();
}

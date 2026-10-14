import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { PDFDocument, rgb } from "pdf-lib";

// Entire API is intercepted in a fresh browser context. No project/user writes reach any server.
const base = process.env.ARK_TEST_URL ?? "http://127.0.0.1:3015";
const output = path.resolve(".data/qa/canonical-browser");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const errors = [];
const networkErrors = [],
  apiCalls = [];
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("requestfailed", (request) =>
  networkErrors.push({
    url: request.url(),
    error: request.failure()?.errorText,
  }),
);
page.on("response", (response) => {
  if (response.status() >= 400)
    networkErrors.push({ url: response.url(), status: response.status() });
});
const seed = JSON.parse(fs.readFileSync("public/db.json", "utf8")).blueprint;
const corners = [
  [100, 100],
  [900, 100],
  [900, 700],
  [100, 700],
];
const walls = corners.map((start, i) => ({
  id: `wall-${i}`,
  levelId: "ground",
  start,
  end: corners[(i + 1) % 4],
  thickness: 20,
  height: 3,
}));
const cad = {
  sourceName: "test.dwg",
  metersPerCadUnit: 0.01,
  unitConfirmed: false,
  bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 800 },
  layers: [{ name: "unknown", visible: true, count: 5, role: "reference" }],
  entities: walls.map((w, i) => ({
    id: `source-${i}`,
    kind: "path",
    points: [...w.start, ...w.end],
    closed: false,
    layer: "unknown",
    color: "#65736b",
  })),
  regions: [
    {
      id: "floor",
      name: "Planta baja",
      minX: 0,
      minY: 0,
      maxX: 1000,
      maxY: 800,
      enabled: true,
      repeat: 1,
      elevation: 0,
      viewType: "plan",
    },
  ],
  skipped: {},
};
let geometry = {
  ...seed,
  projectId: "canonical-qa",
  width: 1000,
  height: 800,
  levels: [{ id: "ground", name: "Planta baja", elevation: 0 }],
  rooms: [],
  walls,
  doors: [],
  windows: [],
  columns: [],
  stairs: [],
  slabs: [],
  roofs: [],
  fixtures: [],
  services: [],
  routes: [],
  sheets: [],
  cad,
  calibration: {
    metersPerUnit: 0.01,
    referencePoints: [
      [0, 0],
      [100, 0],
    ],
    referenceDistanceM: 1,
  },
  reconstruction: { version: 6 },
};
const project = {
  id: "canonical-qa",
  name: "Revisión de geometría",
  location: "Lima",
  floors: 1,
  floor_height: 3,
  structure_type: "Reinforced concrete",
  soil_type: "Dense sand",
  role: "owner",
  updated_at: new Date().toISOString(),
  phase: "Design",
  progress: 0,
};
await context.route("**/api/v1/**", async (route) => {
  const pathname = new URL(route.request().url()).pathname,
    method = route.request().method();
  apiCalls.push({ pathname, method });
  let data = [];
  if (pathname.endsWith("/sessions"))
    data = { user: { id: "qa", name: "QA Architect", email: "qa@ark.test" } };
  else if (pathname.endsWith("/projects")) data = [project];
  else if (pathname.endsWith("/canonical-qa")) data = project;
  else if (pathname.includes("/blueprints")) {
    if (method !== "GET") geometry = route.request().postDataJSON().geometry;
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
  await page.goto(base + "/projects/canonical-qa/model");
  await page
    .getByRole("heading", { name: "Confirma la escala del plano", exact: true })
    .waitFor({ timeout: 90_000 });
  await page.screenshot({
    path: path.join(output, "awaiting-units.png"),
    fullPage: true,
  });
  assert.equal(
    await page.locator("canvas[data-engine]").count(),
    0,
    "no empty WebGL while units are pending",
  );
  geometry = { ...geometry, cad: { ...cad, unitConfirmed: true, regions: [] } };
  await page.reload();
  await page
    .getByRole("heading", {
      name: "Selecciona la planta que quieres construir",
      exact: true,
    })
    .waitFor({ timeout: 60_000 });
  geometry = {
    ...geometry,
    cad: { ...cad, unitConfirmed: true },
    doors: [
      {
        id: "bad-opening",
        wallId: "missing",
        levelId: "ground",
        x: 400,
        y: 100,
        width: 90,
        height: 2,
        sillHeight: 0,
      },
    ],
  };
  await page.reload();
  await page
    .getByRole("heading", {
      name: "Conflictos que requieren revisión",
      exact: true,
    })
    .waitFor({ timeout: 60_000 });
  await page
    .getByText("La abertura no tiene un muro anfitrión válido en su nivel.", {
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "geometry-conflict.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "preparation panel fits mobile width",
  );
  await page.screenshot({
    path: path.join(output, "geometry-conflict-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  geometry = { ...geometry, doors: [] };
  await page.reload();
  await page
    .getByRole("heading", { name: "Estudio del modelo", exact: true })
    .waitFor({ timeout: 90_000 });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Exportar modelo canónico · JSON",
      exact: true,
    })
    .click();
  const file = await download;
  await file.saveAs(path.join(output, "canonical.json"));
  const graph = JSON.parse(
    fs.readFileSync(path.join(output, "canonical.json"), "utf8"),
  );
  assert.equal(graph.coordinateSystem, "right-handed-z-up-meters");
  assert.equal(graph.elements.filter((e) => e.kind === "wall").length, 4);
  assert.equal(
    graph.levels[0].topology.faces.filter((f) => !f.exterior).length,
    1,
  );
  await page.screenshot({
    path: path.join(output, "canonical-model.png"),
    fullPage: true,
  });

  geometry = {
    ...geometry,
    cad: undefined,
    calibration: undefined,
    walls: [],
    reconstruction: undefined,
  };
  await page.goto(base + "/projects/canonical-qa/editor?mode=edit&import=1");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 60_000 });
  const pdf = await PDFDocument.create(),
    sheet = pdf.addPage([1000, 400]);
  for (const [x, y, width, height] of [
    [50, 50, 900, 8],
    [50, 342, 900, 8],
    [50, 50, 8, 300],
    [942, 50, 8, 300],
  ])
    sheet.drawRectangle({ x, y, width, height, color: rgb(0, 0, 0) });
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({
      name: "high-resolution-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await pdf.save()),
    });
  const image = dialog.locator('svg[role="img"]');
  await image.waitFor({ timeout: 30_000 });
  const size = await image.evaluate((svg) => ({
    width: svg.viewBox.baseVal.width,
    height: svg.viewBox.baseVal.height,
  }));
  assert(size.width > 2700, "analysis PDF is not reduced to 1400 pixels");
  async function point(x, y) {
    const p = await image.evaluate(
      (svg, p) => {
        const q = new DOMPoint(p.x, p.y).matrixTransform(svg.getScreenCTM());
        return { x: q.x, y: q.y };
      },
      { x, y },
    );
    await page.mouse.click(p.x, p.y);
  }
  await point(200, 200);
  await point(size.width - 200, 200);
  await dialog
    .getByLabel("Distancia real entre puntos (m)", { exact: true })
    .fill("10");
  await dialog
    .getByRole("button", { name: "Preparar propuesta", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Importar borrador y revisar", exact: true })
    .waitFor({ timeout: 130_000 });
  await page.screenshot({
    path: path.join(output, "tiled-import.png"),
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Importar borrador y revisar", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden", timeout: 30_000 });
  if (geometry.walls.length !== 4)
    console.error(
      JSON.stringify({
        rasterWalls: geometry.walls.map((w) => ({
          start: w.start,
          end: w.end,
          thickness: w.thickness,
        })),
      }),
    );
  assert.equal(
    geometry.walls.length,
    4,
    "browser worker composes four walls from tiled PDF",
  );
  assert(
    geometry.sheets[0].width > 2700,
    "saved sheet keeps analysis coordinates",
  );
  assert(
    geometry.review.warnings.some((w) => /^tiled-lines-baseline:[2-9]/.test(w)),
    "more than one analysis tile was processed",
  );
  assert.deepEqual(errors, [], "no worker/React runtime errors");
  console.log(
    "Browser checks passed: units/floors/conflicts, mobile layout, canonical worker/export and high-resolution raster worker import.",
  );
} catch (error) {
  await page
    .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
    .catch(() => {});
  console.error(
    JSON.stringify({
      runtimeErrors: errors,
      networkErrors,
      apiCalls,
      body: (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      ).slice(0, 5000),
    }),
  );
  throw error;
} finally {
  await browser.close();
}

import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const base = process.env.ARK_TEST_URL ?? "http://127.0.0.1:3010";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const errors = [],
  outside = [];
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
context.on("request", (request) => {
  if (/^https?:/.test(request.url()) && !request.url().startsWith(base))
    outside.push(request.url());
});
const output = path.resolve(".data/qa/plan-screenshots");
await mkdir(output, { recursive: true });
const api = async (url, method = "GET", body, headers) => {
  const response = await context.request.fetch(base + "/api/v1" + url, {
    method,
    data: body,
    headers,
  });
  const result = await response.json();
  assert(
    response.ok(),
    `${method} ${url}: ${response.status()} ${JSON.stringify(result)}`,
  );
  return result.data;
};
try {
  const probe = await context.request.get(base + "/api/v1/sessions");
  assert.equal(
    probe.headers()["x-ark-test-mode"],
    "1",
    "Refusing writes outside QA storage",
  );
  await api("/users", "POST", {
    email: `plan-ui-${Date.now()}@ark.test`,
    password: "QA-only-passphrase-2026",
    name: "Plan QA",
  });
  const project = await api("/projects", "POST", {
    name: "Import pipeline QA",
    location: "Lima",
    floors: 1,
    floor_height: 2.8,
    structure_type: "Reinforced concrete",
    soil_type: "Dense sand",
  });
  const root = `/projects/${project.id}`;
  await page.goto(base + root + "/editor?mode=edit&import=1");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 60_000 });
  const empty = await api(root + "/blueprints");
  assert.equal(
    empty[0].geometry.walls.length,
    0,
    "new workspace is not a demo",
  );
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const title of ["COCINA", "ESTUDIO"]) {
    const sheet = pdf.addPage([400, 320]);
    for (const [x, y, width, height] of [
      [40, 30, 328, 8],
      [40, 270, 328, 8],
      [40, 30, 8, 248],
      [360, 30, 8, 248],
    ])
      sheet.drawRectangle({ x, y, width, height, color: rgb(0, 0, 0) });
    sheet.drawText(title, { x: 140, y: 160, size: 20, font });
  }
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({
      name: "calibration-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await pdf.save()),
    });
  await dialog.getByLabel("Página del PDF").waitFor({ timeout: 30_000 });
  await dialog.getByLabel("Página del PDF", { exact: true }).fill("2");
  await dialog.getByLabel("Página del PDF", { exact: true }).fill("1");
  await dialog.getByLabel("Giro / inclinación (°)").fill("0");
  const image = dialog.locator('svg[role="img"]');
  await image.waitFor();
  async function point(x, y) {
    const screen = await image.evaluate(
      (svg, value) => {
        const p = new DOMPoint(value.x, value.y).matrixTransform(
          svg.getScreenCTM(),
        );
        return { x: p.x, y: p.y };
      },
      { x, y },
    );
    await page.mouse.click(screen.x, screen.y);
  }
  await dialog.getByRole("button", { name: "Corregir perspectiva · 4 esquinas", exact: true }).click();
  await point(35, 35); await point(1365, 35); await point(1365, 1085); await point(35, 1085);
  await dialog.getByRole("button", { name: "Aplicar perspectiva", exact: true }).click();
  await point(105, 105);
  await point(1225, 105);
  await dialog
    .getByLabel("Distancia real entre puntos (m)", { exact: true })
    .fill("16");
  await dialog.getByLabel(/Leer textos con OCR local/).check();
  await dialog
    .getByRole("button", { name: "Preparar propuesta", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Importar borrador y revisar", exact: true })
    .waitFor({ timeout: 140_000 });
  await page.screenshot({
    path: path.join(output, "import-review.png"),
    fullPage: true,
  });
  const heading = await dialog.getByRole("heading", { name: "Importar y calibrar plano", exact: true }).boundingBox();
  assert(heading && heading.y >= 0 && heading.y < 200, "import heading remains visible");
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  // Finish theme transitions before judging text/background contrast in a still screenshot.
  await page.screenshot({ path: path.join(output, "import-review-dark.png"), fullPage: true, animations: "disabled" });
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await dialog
    .getByRole("button", { name: "Importar borrador y revisar", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden", timeout: 30_000 });
  const saved = (await api(root + "/blueprints"))[0];
  assert.equal(saved.geometry.levels.length, 1);
  assert(saved.geometry.walls.length >= 4);
  assert(saved.geometry.rooms.length >= 1);
  assert(saved.geometry.walls.every((wall) => wall.sheetId === saved.geometry.sheets[0].id),
    "detected walls retain their source sheet");
  assert(saved.geometry.rooms.every((room) => room.sheetId === saved.geometry.sheets[0].id),
    "detected rooms retain their source sheet");
  assert(saved.geometry.sheets[0].evidence.text.length > 0,
    "OCR evidence is stored on the imported page");
  assert(
    saved.geometry.review.text.some((line) => /COCINA/i.test(line.text)),
    "real OCR recognized the fixture text",
  );
  assert(saved.geometry.review.text.every((line) => line.source === "ocr"));
  assert(
    Math.abs(saved.geometry.calibration.metersPerUnit - 16 / 1120) < 0.00001,
  );
  assert.equal(saved.geometry.review.status, "draft");
  await page.reload();
  await page
    .getByRole("button", { name: "Importar y calibrar plano", exact: true })
    .waitFor({ timeout: 30_000 });
  // The URL may reopen import intentionally; close it before checking the persisted editor.
  if (await page.getByRole("dialog").isVisible())
    await page
      .getByRole("button", { name: "Cerrar importación", exact: true })
      .click();
  await page.screenshot({
    path: path.join(output, "editor-draft.png"),
    fullPage: true,
  });
  // A complete resize gesture should persist once, after pointer release.
  const resizeHandle = page.getByRole("button", {
    name: "Arrastra para ampliar el lienzo en ambas direcciones",
  });
  await resizeHandle.scrollIntoViewIfNeeded();
  const resizeBox = await resizeHandle.boundingBox();
  assert(resizeBox, "canvas resize handle is visible");
  const widthBeforeResize = (await api(root + "/blueprints"))[0].geometry.width;
  let resizePatches = 0;
  const countResizePatch = (request) => {
    if (request.method() === "PATCH" && request.url().includes("/blueprints/"))
      resizePatches += 1;
  };
  page.on("request", countResizePatch);
  const resizeX = resizeBox.x + resizeBox.width / 2;
  const resizeY = resizeBox.y + resizeBox.height / 2;
  const resizedResponse = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes("/blueprints/"),
  );
  await page.mouse.move(resizeX, resizeY);
  await page.mouse.down();
  await page.mouse.move(resizeX + 32, resizeY + 24, { steps: 8 });
  await page.mouse.up();
  await resizedResponse;
  await page.getByText("Plano guardado", { exact: true }).waitFor();
  page.off("request", countResizePatch);
  assert.equal(resizePatches, 1, "one resize gesture sends one plan update");
  assert((await api(root + "/blueprints"))[0].geometry.width > widthBeforeResize);
  const wallId = saved.geometry.walls[0].id;
  await page.goto(base + root + "/editor?mode=edit&element_id=" + encodeURIComponent(wallId));
  await page.getByRole("button", { name: "Marcar elemento revisado", exact: true }).waitFor({ timeout: 30_000 });
  await Promise.all([page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/blueprints/")), page.getByRole("button", { name: "Marcar elemento revisado", exact: true }).click()]);
  assert((await api(root + "/blueprints"))[0].geometry.review.reviewedIds.includes(wallId));
  await Promise.all([page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/blueprints/")), page.getByLabel("Altura 3D (m)", { exact: true }).fill("3")]);
  assert(!(await api(root + "/blueprints"))[0].geometry.review.reviewedIds.includes(wallId), "editing an accepted wall invalidates its review");
  // A second sheet is appended and aligned in project coordinates, not substituted for the first.
  await page.getByRole("button", { name: "Importar y calibrar plano", exact: true }).click();
  await dialog.waitFor({ state: "visible" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "calibration-test.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await dialog.getByLabel("Página del PDF", { exact: true }).fill("2");
  await dialog.getByText("Introducir coordenadas con teclado").click();
  await dialog.getByLabel("1 · X").fill("105");
  await dialog.getByLabel("1 · Y").fill("105");
  await dialog.getByLabel("2 · X").fill("1225");
  await dialog.getByLabel("2 · Y").fill("105");
  await dialog.getByLabel("Distancia real entre puntos (m)", { exact: true }).fill("16");
  await dialog.getByLabel("Desplazamiento X (m)").fill("20");
  await dialog.getByRole("button", { name: "Preparar propuesta", exact: true }).click();
  await dialog.getByRole("button", { name: "Importar borrador y revisar", exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 30_000 });
  const assembled = (await api(root + "/blueprints"))[0].geometry;
  assert.equal(assembled.sheets.length, 2, "both plan sheets persist");
  assert(assembled.walls.length > saved.geometry.walls.length, "new walls append to existing geometry");
  assert(assembled.sheets[1].x > assembled.sheets[0].x, "second sheet has independent alignment");
  assert(assembled.sheets[0].evidence.text.length > 0, "the first page keeps its OCR evidence");
  assert(assembled.walls.some((wall) => wall.sheetId === assembled.sheets[1].id),
    "second-page walls reference the second page explicitly");
  // Updating page two must retire its old element IDs without touching page one.
  const firstSheetWallIds = assembled.walls.filter((wall) => wall.sheetId === assembled.sheets[0].id).map((wall) => wall.id);
  const oldSecondSheetWallIds = assembled.walls.filter((wall) => wall.sheetId === assembled.sheets[1].id).map((wall) => wall.id);
  await page.getByRole("button", { name: "Importar y calibrar plano", exact: true }).click();
  await dialog.waitFor({ state: "visible" });
  await dialog.getByLabel("Acción de importación").selectOption(assembled.sheets[1].id);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "calibration-test.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()),
  });
  await dialog.getByLabel("Página del PDF", { exact: true }).fill("2");
  await dialog.getByText("Introducir coordenadas con teclado").click();
  await dialog.getByLabel("1 · X").fill("105");
  await dialog.getByLabel("1 · Y").fill("105");
  await dialog.getByLabel("2 · X").fill("1225");
  await dialog.getByLabel("2 · Y").fill("105");
  await dialog.getByLabel("Distancia real entre puntos (m)", { exact: true }).fill("16");
  await dialog.getByRole("button", { name: "Preparar propuesta", exact: true }).click();
  await dialog.getByLabel(/Entiendo que se reemplazarán la imagen/).check();
  await dialog.getByRole("button", { name: "Importar borrador y revisar", exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 30_000 });
  const replaced = (await api(root + "/blueprints"))[0].geometry;
  assert.equal(replaced.sheets.length, 2);
  assert.equal(replaced.sheets[1].id, assembled.sheets[1].id, "the sheet identity is stable");
  assert.deepEqual(replaced.walls.filter((wall) => wall.sheetId === assembled.sheets[0].id).map((wall) => wall.id), firstSheetWallIds);
  assert(oldSecondSheetWallIds.every((id) => !replaced.walls.some((wall) => wall.id === id)), "old second-page geometry is gone");
  assert(replaced.walls.some((wall) => wall.sheetId === assembled.sheets[1].id), "replacement creates linked geometry");
  await page.goto(base + root + "/model?mode=edit");
  await page
    .getByText("Escala calibrada en metros", { exact: true })
    .waitFor({ timeout: 30_000 });
  await page.locator("canvas").waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Vidrio", exact: true }).click();
  await page.getByRole("button", { name: "Concreto", exact: true }).click();
  await page.getByLabel(/Exposición/).focus();
  for (let index = 0; index < 5; index++) await page.getByLabel(/Exposición/).press("ArrowRight");
  assert.equal(await page.getByLabel(/Exposición/).inputValue(), "1.25");
  await page.screenshot({
    path: path.join(output, "calibrated-model.png"),
    fullPage: true,
  });
  await page.reload();
  await page.getByLabel(/Exposición/).waitFor({ timeout: 30_000 });
  assert.equal(
    await page.getByLabel(/Exposición/).inputValue(),
    "1.25",
    "project lighting persists",
  );
  const latest = (await api(root + "/blueprints"))[0];
  const invalid = await context.request.patch(
    base + "/api/v1" + root + "/blueprints/" + saved.id,
    {
      data: {
        geometry: {
          ...saved.geometry,
          calibration: { ...saved.geometry.calibration, metersPerUnit: 10 },
        },
      },
      headers: { "If-Match": JSON.stringify(latest.updated_at) },
    },
  );
  assert.equal(invalid.status(), 422, "REST rejects inconsistent calibration");
  const invalidSource = await context.request.patch(
    base + "/api/v1" + root + "/blueprints/" + saved.id,
    {
      data: {
        geometry: {
          ...latest.geometry,
          walls: latest.geometry.walls.map((wall, index) => index ? wall : { ...wall, sheetId: "missing-sheet" }),
        },
      },
      headers: { "If-Match": JSON.stringify(latest.updated_at) },
    },
  );
  assert.equal(invalidSource.status(), 422, "REST rejects a dangling element-to-sheet link");
  // A concurrent update must surface as a conflict, never as a successful local save.
  await page.goto(base + root + "/editor?mode=edit&element_id=" + encodeURIComponent(wallId));
  await page.getByLabel("Altura 3D (m)", { exact: true }).waitFor();
  const serverVersion = (await api(root + "/blueprints"))[0];
  await api(root + "/blueprints/" + serverVersion.id, "PATCH", {
    geometry: serverVersion.geometry,
  }, { "If-Match": JSON.stringify(serverVersion.updated_at) });
  await page.getByLabel("Altura 3D (m)", { exact: true }).fill("3.2");
  await page.getByText("Hay una versión más reciente", { exact: true }).waitFor();
  assert.equal(
    (await api(root + "/blueprints"))[0].geometry.walls.find((wall) => wall.id === wallId).height,
    serverVersion.geometry.walls.find((wall) => wall.id === wallId).height,
    "a stale editor does not overwrite the server version",
  );
  assert.equal(
    outside.length,
    0,
    `Unexpected external requests: ${outside.join(", ")}`,
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    `PASS: PDF/OCR import, one REST save per resize, revision conflict feedback, calibrated geometry, 3D materials and no external requests. Screenshots: ${output}`,
  );
} catch (error) {
  await page.screenshot({
    path: path.join(output, "failure.png"),
    fullPage: true,
  });
  console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}

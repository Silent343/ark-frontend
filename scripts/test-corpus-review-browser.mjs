import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
const htmlArg = process.argv.indexOf("--html");
let html;
if (htmlArg >= 0) html = path.resolve(process.argv[htmlArg + 1]);
else {
  const fixture = spawnSync(
    process.execPath,
    ["scripts/test-corpus-audit.mjs"],
    { encoding: "utf8" },
  );
  assert.equal(fixture.status, 0, fixture.stderr);
  html = path.join(
    JSON.parse(fixture.stdout.trim()).fixtureDirectory,
    "revision.html",
  );
}
const output = path.dirname(html);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const errors = [],
    externalRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) externalRequests.push(request.url());
  });
  await page.goto(pathToFileURL(html).href);
  await page.locator("#task option").first().waitFor({ state: "attached" });
  assert(await page.locator("#source").textContent());
  await page.locator("#annotator").fill("QA-annotator-not-an-architect");
  await page
    .locator("#reviewer")
    .fill("QA-reviewer-not-independent-validation");
  await page.locator("#view").selectOption("plan");
  await page.locator("#units").fill("0.01");
  if (await page.locator("#list button").count()) {
    await page.locator("#list button").first().click();
    await page.locator("#accept").click();
  }
  await page.locator("#mode").selectOption("box");
  const box = await page.locator("#canvas").boundingBox();
  await page.mouse.move(box.x + 120, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 210);
  await page.mouse.up();
  assert.match(
    await page.locator("#feedback").textContent(),
    /Anotación añadida/,
  );
  await page.locator("#mode").selectOption("polyline");
  for (const [x, y] of [
    [230, 130],
    [230, 200],
    [300, 200],
  ])
    await page.mouse.click(box.x + x, box.y + y);
  await page.locator("#finish").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export").click();
  const download = await downloadPromise;
  const downloaded = path.join(output, "browser-qa-draft.json");
  await download.saveAs(downloaded);
  const draft = JSON.parse(fs.readFileSync(downloaded, "utf8"));
  assert.equal(draft.trainingReady, false);
  assert.equal(draft.independentlyReviewed, false);
  assert.equal(draft.tasks[0].reviewed, false);
  assert.equal(draft.tasks[0].shapes, undefined);
  assert(draft.tasks[0].annotations.some((a) => a.geometry === "polyline"));
  assert(draft.tasks[0].annotations.length >= 2);
  await page.locator("#draftFile").setInputFiles(downloaded);
  await page.waitForFunction(() =>
    document
      .getElementById("feedback")
      .textContent.includes("Borrador cargado"),
  );
  const malicious = structuredClone(draft);
  malicious.tasks[0].sourceHash = "0".repeat(64);
  await page
    .locator("#draftFile")
    .setInputFiles({
      name: "wrong-source.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(malicious)),
    });
  await page.waitForFunction(() =>
    document.getElementById("feedback").textContent.includes("No se cargó"),
  );
  if (htmlArg >= 0) {
    await page.reload();
    await page.locator("#task option").first().waitFor({ state: "attached" });
  }
  await page.screenshot({
    path: path.join(output, "revision-qa.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log(
    JSON.stringify({
      passed: true,
      html,
      tasks: draft.tasks.length,
      checks:
        "offline rendering, proposals, manual boxes and networks, draft export/import, wrong-source rejection, no false review certification",
      errors,
      externalRequests,
    }),
  );
} finally {
  await browser.close();
}

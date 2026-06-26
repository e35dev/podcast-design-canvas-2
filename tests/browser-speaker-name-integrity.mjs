// Running-product acceptance for speaker name integrity (#172).
// Mirrors maintainer rendered-UI probe: setup with Sam Rivera + social links → context
// review → transcript correction → export, without corrupting confirmed names.
// Run: node tests/browser-speaker-name-integrity.mjs
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8766;
const HOST_NAME = "Sam Rivera";

function mime(path) {
  const ext = extname(path);
  if (ext === ".html") return "text/html";
  if (ext === ".css") return "text/css";
  if (ext === ".js") return "text/javascript";
  return "application/octet-stream";
}

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const rel = req.url === "/" ? "/index.html" : req.url.split("?")[0];
      const file = join(root, rel.replace(/^\//, ""));
      if (!file.startsWith(root) || !existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": mime(file) });
      res.end(readFileSync(file));
    });
    server.listen(port, () => resolve(server));
  });
}

async function attachPlaceholders(page) {
  const buttons = page.locator(".file-placeholder-btn");
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    await buttons.nth(i).click();
  }
}

async function main() {
  const server = await startServer();
  let browser;
  let failed = false;
  const log = (ok, msg) => {
    console.log(`${ok ? "  ok" : " FAIL"} ${msg}`);
    if (!ok) failed = true;
  };

  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Create show & import episode →" }).first().click();
    await page.waitForSelector(".create-show-form, .create-show-preset-grid");
    await page.locator("#f-show-name").fill("Founders Unfiltered");
    await page.locator(".create-show-preset-card").first().click();
    await page.getByRole("button", { name: "Create show & import episode →" }).last().click();
    await page.waitForSelector("#f-episodeName");

    await page.locator("#f-episodeName").fill("Founders Unfiltered #7");
    await page.locator("#mode-upload").click();
    await page.locator("#f-sp-0-name").fill(HOST_NAME);
    await page.locator("#f-sp-1-name").fill("Dana Kim");
    await page.locator("#f-sp-2-name").fill("Alex Chen");
    await page.locator("#f-sp-0-social-twitter").fill("https://x.com/samrivera");
    await attachPlaceholders(page);
    await page.locator("#setup-complete-continue").click();

    await page.waitForSelector(".context-step");
    const contextText = await page.locator("#app").innerText();
    log(contextText.includes("Review context"), "Setup with social links opens context review");
    log(contextText.includes("Name from setup:"), "Context review shows setup name reference");
    log(await page.locator(".context-setup-name").first().innerText() === HOST_NAME, "Context review shows Sam Rivera from setup");
    log((await page.locator("#ctx-0-displayName").inputValue()) === HOST_NAME, "Approved name defaults to Sam Rivera");

    await page.getByRole("button", { name: "Approve context & continue →" }).click();
    await page.waitForSelector(".audio-step");
    await page.locator(".audio-preset-card").first().click();
    await page.getByRole("button", { name: "Apply audio & continue →" }).click();

    await page.waitForSelector(".style-step, .guided-workspace");
    if (await page.locator(".style-step").count()) {
      await page.locator(".style-preset-card").first().click();
      await page.getByRole("button", { name: "Apply style & continue →" }).click();
      await page.waitForSelector(".guided-workspace, .moments-step");
    }

    if (await page.locator(".guided-workspace").count()) {
      await page.locator("#workspace-primary-next").click();
      await page.waitForSelector(".moments-step");
    }

    await page.getByRole("button", { name: "+ Caption" }).click();
    const captionText = page.locator(".moment-row input[type='text']").first();
    await captionText.waitFor({ state: "visible" });
    await captionText.fill("Sam Rivira shares the latest update");
    await captionText.press("Tab");
    await page.getByRole("button", { name: "Save moments & continue →" }).click();
    await page.waitForSelector(".guided-workspace");

    let appText = await page.locator("#app").innerText();
    log(appText.includes(HOST_NAME), "Workspace recap still shows Sam Rivera after context approval");
    log(!appText.includes("Sam Riveraa"), "Workspace recap does not show corrupted Sam Riveraa");

    await page.getByRole("button", { name: "Review episode →" }).click();
    await page.waitForSelector(".publish-review-step");
    await page.getByRole("button", { name: "Review transcript & captions →" }).click();
    await page.waitForSelector(".transcript-correction-step");
    const hostLabel = page.locator("#tc-speaker-Host-label");
    log((await hostLabel.inputValue()) === HOST_NAME, "Transcript correction keeps Host label as Sam Rivera");
    appText = await page.locator("#app").innerText();
    log(!appText.includes("Sam Riveraa"), "Transcript correction screen avoids Sam Riveraa corruption");

    await page.getByRole("button", { name: "Apply corrections →" }).click();
    await page.waitForSelector(".publish-review-step");
    appText = await page.locator("#app").innerText();
    log(appText.includes(HOST_NAME), "Publish review still references Sam Rivera");
    await page.getByRole("button", { name: "Approve for export →" }).click();
    await page.getByRole("button", { name: "Continue to publish package →" }).click();
    await page.waitForSelector(".publish-package-step, .export-step");

    if (await page.locator(".publish-package-step").count()) {
      const creditName = page.locator(".publish-credit-name").first();
      log((await creditName.inputValue()) === HOST_NAME, "Publish package credits keep Sam Rivera");
      await page.getByRole("button", { name: "Continue to export →" }).click();
    }

    await page.waitForSelector(".export-step");
    appText = await page.locator("#app").innerText();
    log(appText.includes("Final episode summary"), "Export screen shows final episode summary");
    log(appText.includes(HOST_NAME), "Export summary includes Sam Rivera");
    log(!appText.includes("Sam Riveraa"), "Export summary does not include Sam Riveraa");
  } catch (err) {
    failed = true;
    console.error("browser acceptance error:", err.message);
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  if (failed) process.exit(1);
  console.log("\nbrowser speaker name integrity: running-product acceptance passed.");
}

main();

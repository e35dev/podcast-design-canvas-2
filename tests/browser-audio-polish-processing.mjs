// Running-product acceptance for audio polish processing handoff (#197).
// Run: node tests/browser-audio-polish-processing.mjs
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8770;

const EPISODE_NAME = "Indie Makers Weekly - Episode 3";
const SPEAKERS = ["Jordan Lee", "Priya Shah", "Chris Ortiz"];

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

async function completeFreshSetup(page) {
  await page.getByRole("button", { name: "Start blank episode" }).click();
  await page.waitForSelector("form.setup-import");
  await page.locator("#f-episodeName").fill(EPISODE_NAME);
  await page.locator("#f-riversideLink").fill("https://riverside.fm/studio/indie-makers-ep3");
  for (let index = 0; index < SPEAKERS.length; index += 1) {
    await page.locator(`#f-sp-${index}-name`).fill(SPEAKERS[index]);
  }
  await page.locator(".setup-preset-card").first().click();
  await page.locator(".guided-workspace").waitFor({ state: "visible" });
}

async function polishAndApply(page) {
  await page.locator("#workspace-primary-next, .workspace-checklist-open").filter({ hasText: /Polish audio|Change audio/i }).first().click();
  await page.locator(".audio-step").waitFor();
  await page.locator(".audio-preset-card").filter({ hasText: "Studio" }).click();
  await page.getByRole("button", { name: "Apply audio polish →" }).click();
  await page.locator(".audio-track-status-ready, .audio-polish-complete").first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Continue to workspace →" }).click();
  await page.locator(".guided-workspace").waitFor({ state: "visible", timeout: 10000 });
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
    const chromePath = "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";
    browser = await chromium.launch({
      headless: true,
      executablePath: existsSync(chromePath) ? chromePath : undefined,
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await completeFreshSetup(page);
    await polishAndApply(page);

    const workspaceText = await page.locator(".guided-workspace").innerText();
    log(/polished track/i.test(workspaceText) || /Studio/.test(workspaceText), "Workspace reflects completed audio polish");

    const checklistText = await page.locator(".workspace-production-checklist").innerText();
    log(/polished track/i.test(checklistText) || /Studio/.test(checklistText), "Production checklist reflects saved polished audio");

    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open" }).first().click();
    await page.getByRole("button", { name: "Resume →" }).first().click();
    await page.locator(".guided-workspace").waitFor({ state: "visible" });

    const resumedText = await page.locator(".guided-workspace").innerText();
    log(resumedText.includes(EPISODE_NAME), "Reloaded episode resumes into the same workspace");
    log(/polished track/i.test(resumedText) || /Studio/.test(resumedText), "Reload preserves applied audio polish state");

    await page.locator("#workspace-primary-next, .workspace-checklist-open").filter({ hasText: /Polish audio|Change audio/i }).first().click();
    await page.locator(".audio-step").waitFor();
    const audioText = await page.locator(".audio-step").innerText();
    log(/Saved ✓ .*polished\.wav/i.test(audioText), "Audio polish panel shows saved polished WAV outputs per track");
    log(audioText.includes("Jordan Lee"), "Reloaded audio polish panel keeps Host track Jordan Lee");
    log(audioText.includes("Priya Shah"), "Reloaded audio polish panel keeps Guest 1 track Priya Shah");
    log(audioText.includes("Chris Ortiz"), "Reloaded audio polish panel keeps Guest 2 track Chris Ortiz");

    await page.screenshot({ path: join(root, "tests", "audio-polish-processing-applied.png"), fullPage: false });
    log(true, "Screenshot saved to tests/audio-polish-processing-applied.png");
  } catch (err) {
    console.error(err);
    failed = true;
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  if (failed) {
    process.exit(1);
  }
  console.log("\nBrowser audio polish processing: all checks passed.");
}

main();

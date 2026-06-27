// Running-product acceptance for audio polish processing (#197).
// Run: node tests/browser-audio-polish-processing.mjs
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8771;

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

async function completeSetup(page) {
  await page.getByRole("button", { name: "Start blank episode" }).click();
  await page.waitForSelector("form.setup-import");
  await page.locator("#f-episodeName").fill("Indie Makers Weekly — Episode 3");
  await page.locator("#f-riversideLink").fill("https://riverside.fm/studio/indie-makers-ep3");
  await page.locator("#f-sp-0-name").fill("Jordan Lee");
  await page.locator("#f-sp-1-name").fill("Priya Shah");
  await page.locator("#f-sp-2-name").fill("Chris Ortiz");
  await page.locator(".setup-preset-card").first().click();
  await page.locator(".guided-workspace").waitFor({ state: "visible" });
}

async function openAudioPolish(page) {
  await page.locator("#workspace-primary-next, .workspace-checklist-open").filter({ hasText: "Polish audio" }).first().click();
  await page.locator(".audio-step").waitFor();
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await completeSetup(page);
    await openAudioPolish(page);
    log(await page.locator(".audio-track-status-pending").count() >= 3, "Audio polish opens with pending imported speaker tracks");

    await page.locator(".audio-preset-card").first().click();
    await page.locator("#workspace-primary-next").click();
    await page.locator(".audio-track-status-complete").first().waitFor({ timeout: 15000 });
    log(await page.locator(".audio-track-status-complete").count() === 3, "Apply processes all speaker tracks to complete");
    log(/polished WAV assets saved/i.test(await page.locator("#audio-polish-asset-line").innerText()), "Asset line reports saved polished WAV assets");
    log(/riverside-sync\.wav|Riverside synced/i.test(await page.locator(".audio-step").innerText()), "Tracks reference imported Riverside fixture media");

    await page.screenshot({ path: join(root, "tests", "audio-polish-complete.png"), fullPage: false });

    await page.locator(".guided-workspace").waitFor({ state: "visible", timeout: 15000 });
    log(await page.locator(".guided-workspace").isVisible(), "Apply advances to production workspace after processing");

    const session = await page.evaluate(() => {
      const raw = localStorage.getItem("pdc-episode-sessions");
      const sessions = raw ? JSON.parse(raw) : {};
      const first = Object.values(sessions)[0] || {};
      return {
        appliedAudioPolish: first.appliedAudioPolish || null,
        audioPolish: first.audioPolish || null,
      };
    });
    log(Boolean(session.appliedAudioPolish && session.appliedAudioPolish.allTracksComplete), "Reloaded session snapshot preserves completed polished audio summary");
    log((session.appliedAudioPolish && session.appliedAudioPolish.polishedTrackCount) === 3, "Session stores polished track count for all speakers");

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".guided-workspace").waitFor({ state: "visible" });
    await page.locator("#workspace-primary-next, .workspace-checklist-open").filter({ hasText: "Polish audio" }).first().click();
    await page.locator(".audio-step").waitFor();
    log(await page.locator(".audio-track-status-complete").count() === 3, "Reload restores completed polished track statuses on audio polish screen");

    await page.getByRole("button", { name: "← Back to setup" }).click();
    await page.locator(".guided-workspace").waitFor({ state: "visible" });
    await page.locator("#workspace-primary-next, .workspace-checklist-open").filter({ hasText: "Export episode" }).first().click();
    await page.locator(".publish-review-step, .export-step").first().waitFor();
    const exportBlocked = await page.locator(".publish-review-step").isVisible();
    log(exportBlocked, "Export/review path reflects polished-audio gate before raw export unlock");
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


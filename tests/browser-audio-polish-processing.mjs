// Running-product acceptance for real per-track audio polish processing (#197).
// Proves the "Apply audio & continue →" button actually processes each imported
// speaker track (decode → DSP → encode), persists every polished track, survives a
// reload, and that export/review consume the polished audio.
// Run: node tests/browser-audio-polish-processing.mjs
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8770;
const SESSIONS_KEY = "pdc-episode-sessions";
const WAV_PREFIX = "data:audio/wav;base64,";

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
  await page.locator("#f-episodeName").fill("Founders Unfiltered #7");
  await page.locator("#f-sp-0-name").fill("Sam Rivera");
  await page.locator("#f-sp-1-name").fill("Dana Kim");
  await page.locator("#f-sp-2-name").fill("Alex Chen");
  await page.locator(".setup-preset-card").first().click();
  await page.locator(".guided-workspace").waitFor({ state: "visible" });
}

async function openAudioFromWorkspace(page) {
  await page.locator("#workspace-primary-next, .workspace-checklist-open")
    .filter({ hasText: /Polish audio|Change audio/ }).first().click();
  await page.locator(".audio-step").waitFor();
}

function readSessionTracks(page) {
  return page.evaluate((key) => {
    const sessions = JSON.parse(localStorage.getItem(key) || "{}");
    const session = Object.values(sessions)[0] || {};
    const audio = session.audioPolish || {};
    return Array.isArray(audio.tracks) ? audio.tracks : [];
  }, SESSIONS_KEY);
}

function tracksAreComplete(tracks, expected, label, log) {
  log(tracks.length === expected, `${label}: persisted ${tracks.length}/${expected} polished tracks`);
  const allComplete = tracks.length === expected && tracks.every((t) => t.status === "complete");
  log(allComplete, `${label}: every persisted track has status complete`);
  const assets = tracks.map((t) => t.processedAsset || "");
  const allWav = assets.every((a) => a.indexOf(WAV_PREFIX) === 0 && a.length > WAV_PREFIX.length + 60);
  log(allWav, `${label}: every polished asset is a real WAV data URI longer than a header`);
  const distinct = new Set(assets).size === expected;
  log(distinct, `${label}: every track has a distinct polished data URI (not the single-asset bug)`);
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
    await openAudioFromWorkspace(page);

    // Completion must appear only after Apply — never before (killed #209).
    const completeBefore = await page.locator('.audio-track[data-status="complete"]').count();
    const savedBefore = await page.getByText("Saved", { exact: true }).count();
    log(completeBefore === 0 && savedBefore === 0, "No track shows completion before Apply is pressed");
    const trackCount = await page.locator(".audio-track").count();
    log(trackCount === 3, "Audio step lists one track per speaker");

    await page.locator(".audio-preset-card").first().click();
    await page.getByRole("button", { name: "Apply audio & continue →" }).click();
    // Single click processes every track and lands back in the workspace.
    await page.locator(".guided-workspace").waitFor({ state: "visible" });

    const tracksAfterApply = await readSessionTracks(page);
    tracksAreComplete(tracksAfterApply, 3, "After Apply", log);

    // Reload: every polished track must survive (not just the last — killed #206).
    await page.reload({ waitUntil: "networkidle" });
    const tracksAfterReload = await readSessionTracks(page);
    tracksAreComplete(tracksAfterReload, 3, "After reload", log);
    const sameAssets = JSON.stringify(tracksAfterApply.map((t) => t.processedAsset))
      === JSON.stringify(tracksAfterReload.map((t) => t.processedAsset));
    log(sameAssets, "Reload restores the exact polished assets for all tracks");

    // Resume the persisted episode and confirm the restored audio is treated as complete.
    await page.getByRole("button", { name: "Open" }).first().click();
    await page.locator(".show-episode-resume-btn").first().click();
    await page.locator(".guided-workspace").waitFor({ state: "visible" });

    // Review/export must consume the polished audio — no audio blocker remains.
    await page.locator("#workspace-primary-next, .workspace-checklist-open")
      .filter({ hasText: "Export episode" }).first().click();
    await page.locator(".publish-review-step").waitFor();
    const audioMissing = await page.getByText("Audio polish missing").count();
    log(audioMissing === 0, "Publish review no longer flags audio as missing");
    const approveBtn = page.getByRole("button", { name: "Approve for export →" });
    log(await approveBtn.isVisible(), "Polished audio + style unlock publish review approval for export");

    await page.getByRole("button", { name: "← Back to workspace" }).click();
    await page.locator(".guided-workspace").waitFor({ state: "visible" });
    await openAudioFromWorkspace(page);
    const restoredComplete = await page.locator('.audio-track[data-status="complete"]').count();
    log(restoredComplete === 3, "Resumed audio step restores all polished tracks as Saved");
    await page.screenshot({ path: join(root, "tests", "audio-polish-processing.png"), fullPage: false });
    log(true, "Screenshot saved to tests/audio-polish-processing.png");
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

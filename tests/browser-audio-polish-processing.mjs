// Running-product acceptance for audio polish processing (#197).
// Drives the real app: open the sample episode, click "Apply audio & continue",
// and confirm the imported speaker tracks are processed into durable polished
// WAV assets that are shown as Saved, persist across a reload, and unlock export.
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

// Reads the persisted episode session and reports whether real polished WAV
// assets were stored — the in-app source of truth for reload persistence.
function persistedPolishState() {
  const raw = localStorage.getItem("pdc-episode-sessions");
  if (!raw) return { found: false };
  const sessions = JSON.parse(raw);
  const session = Object.values(sessions).find(
    (s) => s && s.audioPolish && Array.isArray(s.audioPolish.speakers),
  );
  if (!session) return { found: false };
  const AP = window.PdcAudioPolish;
  const EXP = window.PdcEpisodeExport;
  const polish = session.audioPolish;
  const summary = AP.summarizePolish(polish);
  return {
    found: true,
    complete: AP.hasCompletePolishedTracks(polish),
    trackCount: summary.polishedTrackCount,
    everyAssetIsWav: polish.speakers.every(
      (t) => typeof t.processedAsset === "string" && t.processedAsset.indexOf("data:audio/wav;base64,") === 0,
    ),
    exportReady: EXP.validateReadiness({ audioPolish: summary, appliedStyle: { presetName: "Studio" } }).ok,
  };
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

    // One click from the home screen into the active audio-polish step.
    await page.getByRole("button", { name: "Polish a sample episode's audio →" }).click();
    await page.locator(".audio-step").waitFor();
    log((await page.locator(".audio-track").count()) === 3, "Sample episode opens audio polish with 3 imported speaker tracks");
    log((await page.locator(".audio-track-status.is-pending").count()) === 3, "Tracks start as Ready to process before Apply");
    await page.screenshot({ path: join(root, "tests", "audio-polish-pending.png"), fullPage: false });

    // Apply: process the imported tracks into saved polished audio.
    await page.getByRole("button", { name: "Apply audio & continue →" }).click();
    await page.locator(".audio-status-banner.is-complete").waitFor();
    log((await page.locator(".audio-track-status.is-complete").count()) === 3, "Apply processes every speaker track to Saved");

    const banner = await page.locator(".audio-status-banner.is-complete").innerText();
    log(/polished WAV asset/.test(banner), `Completion banner reports saved assets: "${banner.trim()}"`);
    log(await page.getByRole("button", { name: "Continue →" }).isVisible(), "Forward action unlocks only after audio is saved");
    await page.screenshot({ path: join(root, "tests", "audio-polish-complete.png"), fullPage: false });

    // Persistence: the saved polished assets are written to the session store.
    const before = await page.evaluate(persistedPolishState);
    log(before.found && before.complete && before.trackCount === 3, "Polished WAV assets are persisted for all 3 tracks");
    log(before.everyAssetIsWav, "Every persisted track holds a real WAV data URI");

    // Reload: polished assets survive and still satisfy the export gate.
    await page.reload({ waitUntil: "networkidle" });
    const after = await page.evaluate(persistedPolishState);
    log(after.found && after.complete && after.trackCount === 3, "Polished tracks survive a full reload");
    log(after.exportReady, "Reloaded polished tracks unlock export/review readiness");

    log(true, "Screenshots saved to tests/audio-polish-pending.png and tests/audio-polish-complete.png");
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

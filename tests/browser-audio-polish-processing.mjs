// Running-product acceptance for real audio polish processing (#197).
// Drives the full path the active step exists to make real: open Polish audio,
// click "Apply audio & continue", confirm each imported speaker track is saved
// as a polished WAV asset, and confirm those saved assets survive a reload.
// Run: node tests/browser-audio-polish-processing.mjs   (requires playwright)
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8771;

const EPISODE_NAME = "Studio Sessions — Episode 9";
const RIVERSIDE = "https://riverside.fm/studio/studio-sessions-ep9";
const SPEAKERS = ["Maya Brooks", "Theo Park", "Lena Cruz"];

function mime(path) {
  const ext = extname(path);
  if (ext === ".html") return "text/html";
  if (ext === ".css") return "text/css";
  if (ext === ".js") return "text/javascript";
  if (ext === ".wav") return "audio/wav";
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
  await page.locator("#f-riversideLink").fill(RIVERSIDE);
  await page.locator("#f-sp-0-name").fill(SPEAKERS[0]);
  await page.locator("#f-sp-1-name").fill(SPEAKERS[1]);
  await page.locator("#f-sp-2-name").fill(SPEAKERS[2]);
  await page.locator(".setup-preset-card").first().click();
  await page.locator(".guided-workspace").waitFor({ state: "visible" });
}

async function openAudioStep(page) {
  await page
    .locator("#workspace-primary-next, .workspace-checklist-open")
    .filter({ hasText: /audio/i })
    .first()
    .click();
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await completeFreshSetup(page);
    await openAudioStep(page);

    // Pre-apply: real sample sources are loaded and an Apply action is present.
    const preApply = await page.locator(".audio-step").innerText();
    log(/sample studio recording/i.test(preApply), "Audio step loads real sample studio recordings for the tracks");
    const applyButton = page.getByRole("button", { name: /Apply audio & continue/ });
    log((await applyButton.count()) > 0, "Apply audio & continue is available on the audio step");

    // The action this step exists to make real.
    await applyButton.first().click();
    await page.locator(".audio-result-banner.complete").waitFor();

    const saved = await page.locator(".audio-track-saved").count();
    log(saved >= 3, `Each speaker track is saved as a polished asset (saved tracks: ${saved})`);
    const banner = await page.locator(".audio-result-banner.complete").innerText();
    log(/polished WAV asset/i.test(banner), "Completion banner confirms polished WAV assets were saved");
    const stepText = await page.locator(".audio-step").innerText();
    log(/\.polished\.wav/i.test(stepText), "Per-track saved polished WAV file names are shown");
    log((await page.getByRole("button", { name: /^Continue/ }).count()) > 0, "Continue unlocks only after polishing completes");

    // Capture the post-Apply audio step: every track saved as a polished WAV.
    await page.screenshot({ path: join(root, "tests", "audio-polish-processing.png"), fullPage: true });
    log(true, "Screenshot saved to tests/audio-polish-processing.png");

    // Continue out of the audio step so the episode session is saved.
    await page.getByRole("button", { name: /^Continue/ }).first().click();
    await page.locator(".guided-workspace").waitFor();

    // Reload preserves the saved polished track references in the durable
    // episode session (the same store the workspace resumes from).
    await page.reload({ waitUntil: "networkidle" });
    const persisted = await page.evaluate(() => {
      const raw = localStorage.getItem("pdc-episode-sessions");
      if (!raw) return { names: [], saved: 0 };
      const sessions = JSON.parse(raw);
      const snapshot = Object.values(sessions).find(
        (s) => s && s.appliedAudioPolish && s.appliedAudioPolish.processing,
      );
      const processing = snapshot ? snapshot.appliedAudioPolish.processing : null;
      const names = processing
        ? (processing.assets || []).filter((a) => a.status === "saved").map((a) => a.assetName)
        : [];
      return { names, saved: processing ? processing.savedCount : 0, hasBytes: Boolean(processing && (processing.assets || []).some((a) => a.dataBase64)) };
    });
    log(persisted.saved >= 3, `Reload preserves saved polished tracks (saved: ${persisted.saved})`);
    log(persisted.names.every((n) => /\.polished\.wav$/.test(n)) && persisted.names.length >= 3, "Persisted references point at the polished WAV assets");
    log(persisted.hasBytes, "Persisted polished audio bytes survive reload");
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

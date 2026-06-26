// Running-product acceptance for real imported-media audio polish (#197).
// Proves the "Apply audio & continue →" button processes the ACTUAL uploaded speaker
// media: each speaker's real file bytes are captured, decoded, transformed and persisted;
// every polished asset is bound to its source file by fingerprint; the assets survive a
// reload; and review/export consume them. Run: node tests/browser-audio-polish-processing.mjs
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

// Build a real, decodable 16-bit mono WAV "upload" — distinct per seed.
function makeWavUpload(seed) {
  const rate = 16000;
  const total = Math.round(rate * 2.5);
  const dataSize = total * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  const freq = 130 + (seed % 7) * 35;
  let noise = (seed + 1) * 99991;
  for (let i = 0; i < total; i += 1) {
    const t = i / rate;
    noise = (noise * 1103515245 + 12345) & 0x7fffffff;
    let v = Math.sin(2 * Math.PI * freq * t) * 0.5 + (noise / 0x7fffffff * 2 - 1) * 0.2;
    if (v > 1) v = 1; else if (v < -1) v = -1;
    buf.writeInt16LE(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), 44 + i * 2);
  }
  return buf;
}

// Must match app/audio-polish.js sourceFingerprint(): FNV-1a over the raw file bytes.
function fingerprint(bytes) {
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = (hash * 16777619) >>> 0;
  }
  return `src-${(hash >>> 0).toString(16)}-${bytes.length}`;
}

const SPEAKERS = ["Sam Rivera", "Dana Kim", "Alex Chen"];
const UPLOADS = SPEAKERS.map((_, i) => makeWavUpload(i + 1));
const EXPECTED_HASHES = UPLOADS.map((bytes) => fingerprint(bytes));

async function completeUploadSetup(page) {
  await page.getByRole("button", { name: "Start blank episode" }).click();
  await page.waitForSelector("form.setup-import");
  // Switch to per-speaker file upload mode so each speaker has its own imported media.
  await page.locator("#mode-upload").check();
  await page.waitForSelector("#f-sp-0-source[type=file]");
  await page.locator("#f-episodeName").fill("Founders Unfiltered #7");
  for (let i = 0; i < SPEAKERS.length; i += 1) {
    await page.locator(`#f-sp-${i}-name`).fill(SPEAKERS[i]);
    await page.locator(`#f-sp-${i}-source`).setInputFiles({
      name: `speaker-${i + 1}.wav`,
      mimeType: "audio/wav",
      buffer: UPLOADS[i],
    });
  }
  // Wait until every speaker's real audio has been captured (decoded + fingerprinted).
  await page.waitForFunction(
    () => document.querySelectorAll('.speaker-source-block[data-media-ready="true"]').length >= 3,
    null,
    { timeout: 15000 },
  );
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

function checkPolishedTracks(tracks, label, log) {
  log(tracks.length === 3, `${label}: persisted 3 polished tracks (got ${tracks.length})`);
  log(tracks.every((t) => t.status === "complete"), `${label}: every track status is complete`);
  const assets = tracks.map((t) => t.processedAsset || "");
  log(assets.every((a) => a.indexOf(WAV_PREFIX) === 0 && a.length > WAV_PREFIX.length + 60),
    `${label}: every polished asset is a real WAV data URI`);
  log(new Set(assets).size === 3, `${label}: polished assets are distinct per track`);
  // The decisive proof: each polished track is bound to the REAL uploaded file bytes.
  const byIndex = tracks.slice().sort((a, b) => a.trackIndex - b.trackIndex);
  const hashesMatch = byIndex.every((t, i) => t.mediaSourceHash === EXPECTED_HASHES[i]);
  log(hashesMatch, `${label}: each polished track's source fingerprint matches its uploaded file`);
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

    await completeUploadSetup(page);
    await openAudioFromWorkspace(page);

    // Completion must appear only after Apply — never before (killed #209).
    const completeBefore = await page.locator('.audio-track[data-status="complete"]').count();
    const savedBefore = await page.getByText("Saved", { exact: true }).count();
    log(completeBefore === 0 && savedBefore === 0, "No track shows completion before Apply is pressed");
    const withMedia = await page.locator('.audio-track[data-has-media="true"]').count();
    log(withMedia === 3, "Audio step shows captured imported media for every speaker track");

    await page.locator(".audio-preset-card").first().click();
    await page.getByRole("button", { name: "Apply audio & continue →" }).click();
    await page.locator(".guided-workspace").waitFor({ state: "visible" });

    checkPolishedTracks(await readSessionTracks(page), "After Apply", log);

    // Reload: every polished track must survive (not just the last — killed #206).
    await page.reload({ waitUntil: "networkidle" });
    const reloadedTracks = await readSessionTracks(page);
    checkPolishedTracks(reloadedTracks, "After reload", log);

    // Resume the persisted episode and confirm review/export consume the polished audio.
    await page.getByRole("button", { name: "Open" }).first().click();
    await page.locator(".show-episode-resume-btn").first().click();
    await page.locator(".guided-workspace").waitFor({ state: "visible" });

    await page.locator("#workspace-primary-next, .workspace-checklist-open")
      .filter({ hasText: "Export episode" }).first().click();
    await page.locator(".publish-review-step").waitFor();
    log((await page.getByText("Audio polish missing").count()) === 0,
      "Publish review no longer flags audio as missing");
    log(await page.getByRole("button", { name: "Approve for export →" }).isVisible(),
      "Polished imported audio + style unlock publish review approval for export");

    await page.getByRole("button", { name: "← Back to workspace" }).click();
    await page.locator(".guided-workspace").waitFor({ state: "visible" });
    await openAudioFromWorkspace(page);
    log((await page.locator('.audio-track[data-status="complete"]').count()) === 3,
      "Resumed audio step restores all polished tracks as Saved");
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

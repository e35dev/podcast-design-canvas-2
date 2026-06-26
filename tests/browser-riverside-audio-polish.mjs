// Running-product check for the RIVERSIDE-LINK import path (#197).
// The maintainer review sets up via a Riverside link (not file upload). This proves that
// path binds real per-speaker audio so the polish step has genuine tracks to process:
// captured media on every track, Apply drives them to complete, and the polished assets
// are real distinct WAVs persisted in the session. Run: node tests/browser-riverside-audio-polish.mjs
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8772;
const SESSIONS_KEY = "pdc-episode-sessions";
const WAV_PREFIX = "data:audio/wav;base64,";
const SPEAKERS = ["Sam Rivera", "Dana Kim", "Alex Chen"];

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
        res.writeHead(404); res.end("not found"); return;
      }
      res.writeHead(200, { "Content-Type": mime(file) });
      res.end(readFileSync(file));
    });
    server.listen(port, () => resolve(server));
  });
}

function readSessionTracks(page) {
  return page.evaluate((key) => {
    const sessions = JSON.parse(localStorage.getItem(key) || "{}");
    const session = Object.values(sessions)[0] || {};
    const audio = session.audioPolish || {};
    return Array.isArray(audio.tracks) ? audio.tracks : [];
  }, SESSIONS_KEY);
}

async function openAudioFromWorkspace(page) {
  await page.locator("#workspace-primary-next, .workspace-checklist-open")
    .filter({ hasText: /Polish audio|Change audio/ }).first().click();
  await page.locator(".audio-step").waitFor();
}

async function main() {
  const server = await startServer();
  let browser; let failed = false;
  const log = (ok, msg) => { console.log(`${ok ? "  ok" : " FAIL"} ${msg}`); if (!ok) failed = true; };

  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    // Setup via a Riverside LINK (default mode) — no file upload at all.
    await page.getByRole("button", { name: "Start blank episode" }).click();
    await page.waitForSelector("form.setup-import");
    await page.locator("#f-episodeName").fill("Founders Unfiltered #7");
    await page.locator("#f-riversideLink").fill("https://riverside.fm/studio/my-episode");
    for (let i = 0; i < SPEAKERS.length; i += 1) {
      await page.locator(`#f-sp-${i}-name`).fill(SPEAKERS[i]);
    }
    await page.locator(".setup-preset-card").first().click();
    await page.locator(".guided-workspace").waitFor({ state: "visible" });

    await openAudioFromWorkspace(page);

    // THE FIX: a link-imported episode must show captured media on every speaker track.
    const withMedia = await page.locator('.audio-track[data-has-media="true"]').count();
    log(withMedia === 3, `Riverside import binds captured media for every track (got ${withMedia})`);
    const completeBefore = await page.locator('.audio-track[data-status="complete"]').count();
    log(completeBefore === 0, "No track shows completion before Apply");

    await page.locator(".audio-preset-card").first().click();
    await page.getByRole("button", { name: "Apply audio & continue →" }).click();
    await page.locator(".guided-workspace").waitFor({ state: "visible" });

    const tracks = await readSessionTracks(page);
    log(tracks.length === 3, `After Apply: 3 polished tracks (got ${tracks.length})`);
    log(tracks.every((t) => t.status === "complete"), "After Apply: every track complete");
    const assets = tracks.map((t) => t.processedAsset || "");
    log(assets.every((a) => a.indexOf(WAV_PREFIX) === 0 && a.length > WAV_PREFIX.length + 60),
      "After Apply: every polished asset is a real WAV data URI");
    log(new Set(assets).size === 3, "After Apply: polished assets are distinct per track");
    log(tracks.every((t) => t.mediaSourceHash), "After Apply: each track bound to its imported source");

    await page.reload({ waitUntil: "networkidle" });
    const reloaded = await readSessionTracks(page);
    log(reloaded.length === 3 && reloaded.every((t) => t.status === "complete"
      && (t.processedAsset || "").indexOf(WAV_PREFIX) === 0),
      "After reload: polished tracks persist with real audio");
  } catch (err) {
    console.error(err); failed = true;
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  if (failed) process.exit(1);
  console.log("\nBrowser Riverside audio polish: all checks passed.");
}

main();

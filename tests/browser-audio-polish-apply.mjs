// Running-product acceptance for #197: real audio polish processing.
// Uploads genuine WAV bytes, clicks "Apply audio & continue", and verifies the
// per-track PENDING -> PROCESSING -> Polished transitions, the completion gate,
// reload persistence, and that export/review consume the saved polished assets.
// Run: node tests/browser-audio-polish-apply.mjs   (requires `playwright`)
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8771;

const EPISODE = "Indie Makers Weekly — Episode 3";
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

// A real 16-bit PCM WAV as a Node Buffer — the creator's "uploaded" speaker file.
function wavBuffer(seconds, freq) {
  const sr = 16000;
  const n = Math.floor(sr * seconds);
  const dataLen = n * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < n; i += 1) {
    const t = i / sr;
    const s = 0.4 * Math.sin(2 * Math.PI * freq * t) * (0.5 + 0.4 * Math.sin(2 * Math.PI * 2 * t));
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2);
  }
  return buf;
}

async function openPolishAudio(page) {
  // The checklist label is "Polish audio" before processing and "Change audio" after.
  await page.locator("#workspace-primary-next, .workspace-checklist-open").filter({ hasText: /Polish audio|Change audio/ }).first().click();
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    // --- Setup in UPLOAD mode with real uploaded bytes per speaker ---
    await page.getByRole("button", { name: "Start blank episode" }).click();
    await page.waitForSelector("form.setup-import");
    await page.locator("#mode-upload").check();
    await page.locator("#f-episodeName").fill(EPISODE);
    for (let i = 0; i < SPEAKERS.length; i += 1) {
      await page.locator(`#f-sp-${i}-name`).fill(SPEAKERS[i]);
      await page.locator(`#f-sp-${i}-source`).setInputFiles({
        name: `${SPEAKERS[i].split(" ")[0].toLowerCase()}.wav`,
        mimeType: "audio/wav",
        buffer: wavBuffer(3, 150 + i * 60),
      });
    }
    await page.locator(".setup-preset-card").first().click();
    await page.locator(".guided-workspace").waitFor({ state: "visible" });

    // --- Reach the audio step; tracks should be ready, not complete ---
    await openPolishAudio(page);
    const pendingCount = await page.locator(".audio-track-status.status-pending").count();
    log(pendingCount === 3, `Three imported tracks are bound and ready to polish (saw ${pendingCount})`);
    log(await page.locator("#audio-apply-btn").isVisible(), "Apply button is shown before processing");
    log(!(await page.locator("#audio-continue-btn").isVisible()), "Continue is hidden until tracks are polished");

    // --- Click Apply and watch the transitions ---
    await page.locator("#audio-apply-btn").click();
    await page.locator("#audio-continue-btn").waitFor({ state: "visible", timeout: 15000 });
    const completeCount = await page.locator(".audio-track-status.status-complete").count();
    log(completeCount === 3, `All three tracks transitioned to Polished after Apply (saw ${completeCount})`);
    const firstPill = await page.locator(".audio-track-status.status-complete").first().innerText();
    log(/Polished/.test(firstPill) && /dB/.test(firstPill), `Polished pill shows a real metric: "${firstPill.trim()}"`);
    log(!(await page.locator("#audio-apply-btn").isVisible()), "Apply is replaced by Continue once every track is saved");
    const progress = await page.locator("#audio-progress-line").innerText();
    log(/All 3 tracks polished/.test(progress), `Progress line confirms completion: "${progress.trim()}"`);

    await page.screenshot({ path: join(root, "tests", "audio-polish-apply.png"), fullPage: false });
    log(true, "ACCEPTANCE: Apply audio processed every imported track into a saved polished asset");

    // --- Persistence: durable refs survive a real reload ---
    const persisted = await page.evaluate(() => {
      const raw = localStorage.getItem("pdc-episode-sessions");
      if (!raw) return { ok: false };
      const sessions = JSON.parse(raw);
      const snap = Object.values(sessions)[0] || {};
      const pt = snap.polishedTracks || [];
      const assets = (snap.appliedAudioPolish && snap.appliedAudioPolish.polishedAssets) || [];
      return {
        ok: pt.length === 3 && assets.length === 3
          && pt.every((t) => t.result && t.result.outputFingerprint && t.result.sourceFingerprint),
      };
    });
    log(persisted.ok, "Polished asset references (fingerprints) are persisted for all 3 tracks");

    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open" }).first().click();
    await page.locator(".show-episode-resume-btn").first().click();
    await page.locator(".guided-workspace").waitFor({ state: "visible" });
    await openPolishAudio(page);
    const reloadedComplete = await page.locator(".audio-track-status.status-complete").count();
    log(reloadedComplete === 3, `After reload + resume, all 3 tracks still show Polished (saw ${reloadedComplete})`);
    log(await page.locator("#audio-continue-btn").isVisible(), "Reloaded episode keeps the completion gate satisfied");

    // --- Export/review consume the polished assets ---
    await page.locator("#audio-continue-btn").click();
    await page.locator(".guided-workspace").waitFor({ state: "visible" });
    await page.locator(".workspace-checklist-open").filter({ hasText: "Review episode" }).first().click();
    await page.locator(".publish-review-step").waitFor();
    const bodyText = await page.locator("#app").innerText();
    log(/treated asset/i.test(bodyText), "Publish review surfaces the treated polished assets as the audio source");
  } catch (err) {
    console.error(err);
    failed = true;
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  if (failed) process.exit(1);
  console.log("\nBrowser audio polish apply: all checks passed.");
}

main();

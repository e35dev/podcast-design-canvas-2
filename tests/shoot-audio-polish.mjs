// Drives the real app (headless Chromium via the scoring harness) through:
//   new episode -> upload mode -> upload a real file per Host/Guest1/Guest2 ->
//   preset/continue -> workspace -> Polish audio -> change a control -> Apply.
// Captures the polished tracks, the persisted state after navigate-away-and-back, and
// the export/review consuming the polished tracks. Reads back nothing here — caller reads
// the PNGs. Run: LD_LIBRARY_PATH=~/.local/playwrightlibs node tests/shoot-audio-polish.mjs
import { open } from "/home/administrator/workspace/sn74-workspace/podcast-scoring/shoot.mjs";

const repo = "/home/administrator/workspace/sn74-workspace/podcast-design-canvas-2";

function log(msg) {
  console.log(msg);
}

const { page, browser } = await open(repo, { width: 1440, height: 1200 });

async function clickText(text) {
  const ok = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll("button, a, [role=button]")]
      .find((b) => (b.textContent || "").replace(/\s+/g, " ").trim().includes(t));
    if (btn) { btn.click(); return true; }
    return false;
  }, text);
  await page.waitForTimeout(250);
  return ok;
}

async function waitForSelector(sel, label, timeout = 9000) {
  const start = Date.now();
  for (;;) {
    const ok = await page.evaluate((s) => Boolean(document.querySelector(s)), sel);
    if (ok) return true;
    if (Date.now() - start > timeout) throw new Error("timeout waiting for " + label);
    await page.waitForTimeout(80);
  }
}

async function waitForCount(sel, re, n, label, timeout = 9000) {
  const start = Date.now();
  for (;;) {
    const count = await page.evaluate(([s, r]) => {
      const rx = new RegExp(r);
      return [...document.querySelectorAll(s)].filter((node) => rx.test(node.textContent || "")).length;
    }, [sel, re]);
    if (count >= n) return true;
    if (Date.now() - start > timeout) throw new Error("timeout waiting for " + label + " (got " + count + ")");
    await page.waitForTimeout(80);
  }
}

async function fill(id, value) {
  await page.evaluate(([i, v]) => {
    const el = document.getElementById(i);
    if (!el) throw new Error("missing input " + i);
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, [id, value]);
}

const MEDIA_DIR = "/tmp/claude-1000/-home-administrator-workspace/3a291609-f4f0-44a6-8319-babf0041aa29/scratchpad/media";

async function setMediaFile(id, fileName) {
  // Use Playwright's trusted file-chooser injection so the change handler sees real bytes.
  const handle = await page.$("#" + id);
  if (!handle) throw new Error("missing file input " + id);
  await handle.setInputFiles(MEDIA_DIR + "/" + fileName);
}

try {
  // Reset persistence so we start clean.
  await page.evaluate(() => new Promise((resolve) => {
    localStorage.clear();
    const req = indexedDB.deleteDatabase("pdc-source-media");
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  }));
  await page.reload();
  await page.waitForTimeout(400);

  log("step: " + (await clickText("Start blank episode") ? "started blank episode" : "NO start button"));
  await waitForSelector("form.setup-import", "setup form");
  await page.evaluate(() => document.querySelector("#mode-upload").click());
  await waitForSelector("#f-sp-0-source", "upload inputs");

  // Upload the real files FIRST so the change handlers bind to the current speaker
  // objects (typing the episode name re-sanitizes/clones state.speakers, so doing it last
  // keeps the just-uploaded media on the cloned speakers).
  await setMediaFile("f-sp-0-source", "avery-host.wav");
  await setMediaFile("f-sp-1-source", "jordan-guest.wav");
  await setMediaFile("f-sp-2-source", "priya-guest.wav");
  await waitForCount(".chosen-file", "source media saved", 3, "3 media saves (pre-name)");
  await fill("f-sp-0-name", "Avery Stone");
  await fill("f-sp-1-name", "Jordan Lee");
  await fill("f-sp-2-name", "Priya Shah");
  await fill("f-episodeName", "Real Media Polish Demo");
  try {
    await waitForCount(".chosen-file", "source media saved", 3, "3 media saves");
  } catch (e) {
    const txt = await page.evaluate(() =>
      [...document.querySelectorAll(".chosen-file")].map((n) => n.textContent).join(" | "));
    log("CHOSEN-FILE STATE: " + txt);
    throw e;
  }
  log("uploaded 3 real files");

  // Advance out of setup via the real submit button (id), like the #256 probe.
  let advanced = await page.evaluate(() => {
    const btn = document.getElementById("setup-complete-continue");
    if (btn) { btn.click(); return true; }
    return false;
  });
  await page.waitForTimeout(500);
  // If validation bounced us (errors banner), report it.
  const errBanner = await page.evaluate(() => {
    const b = document.getElementById("error-banner");
    return b ? b.innerText.replace(/\s+/g, " ").slice(0, 300) : "";
  });
  if (errBanner) log("SETUP ERROR BANNER: " + errBanner);
  // We may land directly on audio, or in the workspace — handle both.
  const onWorkspace = await page.evaluate(() => Boolean(document.querySelector(".guided-workspace")));
  if (onWorkspace) {
    log("reached workspace");
    await clickText("Polish audio");
  }
  try {
    await waitForSelector(".audio-step", "audio polish screen", 5000);
  } catch (e) {
    log("advanced=" + advanced + " onWorkspace=" + onWorkspace);
    log("VIEW classes: " + (await page.evaluate(() => document.getElementById("app").firstElementChild ? document.getElementById("app").firstElementChild.className : "?")));
    log("BUTTONS: " + (await page.evaluate(() =>
      [...document.querySelectorAll("button")].map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30).join(" | "))));
    throw e;
  }
  // Change a quality control (Studio preset = strong on all four) to prove settings apply.
  await clickText("Studio");
  await page.waitForTimeout(150);

  // Helper: from wherever we are, get back onto the audio polish step showing the
  // APPLIED (complete) polished tracks.
  async function gotoAppliedAudio(label) {
    for (let i = 0; i < 6; i++) {
      const has = await page.evaluate(() => Boolean(document.querySelector(".audio-track-complete")));
      if (has) return true;
      const onAudioStep = await page.evaluate(() => Boolean(document.querySelector(".audio-step")));
      if (!onAudioStep) {
        // Navigate: workspace then Polish audio (revisit / re-open).
        if (!(await clickText("Back to workspace"))) await clickText("workspace");
        await page.waitForTimeout(250);
        if (!(await clickText("Change audio"))) {
          if (!(await clickText("Polish audio"))) await clickText("audio polish");
        }
        await page.waitForTimeout(250);
      } else {
        await page.waitForTimeout(200);
      }
    }
    log(label + " BUTTONS: " + (await page.evaluate(() =>
      [...document.querySelectorAll("button")].map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30).join(" | "))));
    throw new Error("could not reach applied audio for " + label);
  }

  // Click Apply — on complete media this advances (to Style); we then revisit audio.
  await clickText("Apply audio");
  await page.waitForTimeout(700);
  await gotoAppliedAudio("complete");
  await page.screenshot({ path: repo + "/tests/audio-polish-complete.png" });
  log("captured audio-polish-complete.png");

  // Navigate away to workspace and back to prove persistence.
  if (!(await clickText("Back to workspace"))) await clickText("workspace");
  await page.waitForTimeout(300);
  await gotoAppliedAudio("persist");
  await page.waitForTimeout(200);
  await page.screenshot({ path: repo + "/tests/audio-polish-persist.png" });
  log("captured audio-polish-persist.png");

  // Drive to export/review to show downstream consumption of polished tracks.
  // From the audio step, Apply advances to Style; apply Style to reach the workspace.
  async function reachWorkspace() {
    for (let i = 0; i < 8; i++) {
      if (await page.evaluate(() => Boolean(document.querySelector(".guided-workspace")))) return true;
      const onAudio = await page.evaluate(() => Boolean(document.querySelector(".audio-step")));
      const onStyle = await page.evaluate(() => Boolean(document.querySelector(".style-step")));
      if (onAudio) { await clickText("Apply audio"); }
      else if (onStyle) { if (!(await clickText("Apply style"))) await clickText("Continue"); }
      else { if (!(await clickText("Back to workspace"))) await clickText("workspace"); }
      await page.waitForTimeout(400);
    }
    return page.evaluate(() => Boolean(document.querySelector(".guided-workspace")));
  }
  await reachWorkspace();
  await page.waitForTimeout(300);

  // Go to publish review first (it confirms "using N polished tracks"), approve, capture.
  await clickText("Review episode");
  await page.waitForTimeout(400);
  if (await page.evaluate(() => Boolean(document.querySelector(".publish-review-step")))) {
    const auditLine = await page.evaluate(() => {
      const node = [...document.querySelectorAll("*")].find((n) => /using \d+ polished track/.test(n.textContent || "") && n.children.length === 0);
      return node ? node.textContent.replace(/\s+/g, " ").trim() : "(audio-ready line not found)";
    });
    log("REVIEW AUDIO LINE: " + auditLine);
    await clickText("Approve for export");
    await page.waitForTimeout(400);
    await page.screenshot({ path: repo + "/tests/audio-polish-review.png", fullPage: true });
  }

  // Now drive to the export step (workspace -> Export episode). Approved review unlocks it.
  for (let i = 0; i < 10; i++) {
    if (await page.evaluate(() => Boolean(document.querySelector(".export-step")))) break;
    const onReview = await page.evaluate(() => Boolean(document.querySelector(".publish-review-step")));
    if (onReview) { if (!(await clickText("Back to workspace"))) await clickText("workspace"); }
    else {
      const went = (await clickText("Export episode")) || (await clickText("Export"));
      if (!went) { if (!(await clickText("Back to workspace"))) await clickText("workspace"); }
    }
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: repo + "/tests/audio-polish-export.png", fullPage: true });
  const exportText = await page.evaluate(() => {
    const node = document.querySelector(".export-step") || document.querySelector(".publish-review-step") || document.getElementById("app");
    return (node && node.innerText || "").slice(0, 1600);
  });
  log("captured audio-polish-export.png");
  log("EXPORT/REVIEW TEXT >>>\n" + exportText + "\n<<<");
} catch (err) {
  log("DRIVER ERROR: " + (err && err.stack ? err.stack : String(err)));
  await page.screenshot({ path: repo + "/tests/audio-polish-error.png", fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

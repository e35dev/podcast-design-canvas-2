// Running-product acceptance for audio polish processing (#197).
// Run: node tests/browser-audio-polish-processing.mjs
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8770;
const resultId = "audio-polish-results";

function mime(path) {
  const ext = extname(path);
  if (ext === ".html") return "text/html";
  if (ext === ".css") return "text/css";
  if (ext === ".js") return "text/javascript";
  return "application/octet-stream";
}

const testScript = `
(() => {
  const checks = JSON.parse(sessionStorage.getItem("audio-polish-checks") || "[]");
  const log = (ok, msg) => checks.push({ ok: Boolean(ok), msg });
  const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
  const waitFor = async (predicate, label) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("Timed out waiting for " + label);
  };
  const button = (pattern) => Array.from(document.querySelectorAll("button")).find((item) => pattern.test(item.textContent || ""));
  const click = (target, label) => {
    if (!target) {
      const text = (document.body && document.body.innerText ? document.body.innerText : "").replace(/\\s+/g, " ").slice(0, 1200);
      throw new Error("Missing clickable target: " + label + " in " + text);
    }
    target.click();
  };
  const fill = (selector, value) => {
    const input = document.querySelector(selector);
    if (!input) throw new Error("Missing input " + selector);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const wavBytes = (frequency, durationSeconds = 1.1) => {
    const sampleRate = 8000;
    const sampleCount = Math.round(sampleRate * durationSeconds);
    const buffer = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(buffer);
    const writeAscii = (offset, value) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };
    writeAscii(0, "RIFF");
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeAscii(8, "WAVE");
    writeAscii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, "data");
    view.setUint32(40, sampleCount * 2, true);
    for (let index = 0; index < sampleCount; index += 1) {
      const t = index / sampleRate;
      const envelope = 0.72 + 0.18 * Math.sin(2 * Math.PI * 2.3 * t);
      const sample = Math.sin(2 * Math.PI * frequency * t) * 0.42 * envelope;
      view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
    }
    return new Uint8Array(buffer);
  };
  const attachFile = (selector, fileName, contents) => {
    const input = document.querySelector(selector);
    if (!input) throw new Error("Missing file input " + selector);
    const file = new File([contents], fileName, { type: "audio/wav" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    Object.defineProperty(input, "files", {
      configurable: true,
      value: transfer.files,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const sessionAudio = () => {
    const sessions = JSON.parse(localStorage.getItem("pdc-episode-sessions") || "{}");
    const snapshot = Object.values(sessions)[0] || {};
    const applied = snapshot.appliedAudioPolish || {};
    const working = snapshot.audioPolish || {};
    return {
      presetId: applied.presetId,
      readyForExport: applied.readyForExport,
      completeTrackCount: applied.completeTrackCount,
      ids: (applied.polishedTracks || []).map((track) => track.assetId),
      dataUris: (applied.polishedTracks || []).map((track) => track.dataUri),
      sourceHashes: (applied.polishedTracks || []).map((track) => track.sourceHash),
      sourceFileNames: (applied.polishedTracks || []).map((track) => track.sourceFileName),
      sourceByteLengths: (applied.polishedTracks || []).map((track) => track.sourceByteLength),
      workingStatuses: (working.speakers || []).map((track) => track.status),
    };
  };
  const finish = () => {
    document.body.replaceChildren();
    const pre = document.createElement("pre");
    pre.id = "${resultId}";
    pre.textContent = JSON.stringify({ checks });
    document.body.appendChild(pre);
  };

  async function run() {
    if (sessionStorage.getItem("audio-polish-reloaded") === "1") {
      const saved = JSON.parse(sessionStorage.getItem("audio-polish-saved") || "{}");
      const afterReload = sessionAudio();
      log(afterReload.ids.join("|") === (saved.ids || []).join("|"), "Reload preserves polished track references");
      log(afterReload.dataUris.every((uri) => /^data:audio\\/wav;base64,/.test(uri)), "Reload preserves durable WAV data assets");
      finish();
      return;
    }

    localStorage.clear();
    sessionStorage.clear();
    await wait();

    click(button(/Start blank episode/), "Start blank episode");
    await wait();
    click(document.querySelector("#mode-upload"), "Uploaded speaker files mode");
    await wait();
    fill("#f-episodeName", "Audio Polish Weekly #1");
    fill("#f-sp-0-name", "Avery Host");
    fill("#f-sp-1-name", "Blake Guest");
    fill("#f-sp-2-name", "Casey Guest");
    attachFile("#f-sp-0-source", "avery-host.wav", wavBytes(220));
    attachFile("#f-sp-1-source", "blake-guest.wav", wavBytes(330));
    attachFile("#f-sp-2-source", "casey-guest.wav", wavBytes(440));
    await waitFor(
      () => Array.from(document.querySelectorAll(".chosen-file")).every((item) => /ready for polish/.test(item.textContent || "")),
      "uploaded source bytes to be ready",
    );
    const chosenText = Array.from(document.querySelectorAll(".chosen-file")).map((item) => item.textContent || "").join(" | ");
    const selectedCount = (chosenText.match(/Selected:/g) || []).length;
    const readyCount = (chosenText.match(/ready for polish/g) || []).length;
    if (selectedCount !== 3 || readyCount !== 3) {
      throw new Error("Uploaded source files did not finish reading: " + chosenText);
    }
    click(document.querySelector(".setup-preset-card"), "setup preset card");
    await wait();

    let audioButton = Array.from(document.querySelectorAll("#workspace-primary-next, .workspace-checklist-open"))
      .find((item) => /Polish audio/.test(item.textContent || ""));
    if (!audioButton) {
      click(button(/Continue to audio polish/), "Continue to audio polish");
      await wait();
      audioButton = Array.from(document.querySelectorAll("#workspace-primary-next, .workspace-checklist-open"))
        .find((item) => /Polish audio/.test(item.textContent || ""));
    }
    click(audioButton, "Polish audio");
    await wait();
    const studioButton = Array.from(document.querySelectorAll(".audio-preset-card"))
      .find((item) => /Studio/.test(item.textContent || ""));
    click(studioButton, "Studio preset");
    await wait();
    click(button(/Apply audio/), "Apply audio");
    await wait();

    const saved = sessionAudio();
    log(saved.presetId === "studio", "Applied Studio settings are persisted");
    log(saved.readyForExport === true, "Applied audio summary is export-ready");
    log(saved.completeTrackCount === 3, "Every speaker track completed processing");
    log(saved.ids.length === 3 && saved.ids.every(Boolean), "Polished track references are saved");
    log(saved.dataUris.every((uri) => /^data:audio\\/wav;base64,/.test(uri)), "Polished references point to WAV data assets");
    log(saved.sourceHashes.length === 3 && saved.sourceHashes.every(Boolean), "Polished tracks retain imported source byte hashes");
    log(saved.sourceFileNames.join("|") === "avery-host.wav|blake-guest.wav|casey-guest.wav", "Polished tracks reference the uploaded source files");
    log(saved.sourceByteLengths.every((size) => size > 0), "Polished tracks record imported source byte lengths");
    log(saved.workingStatuses.every((status) => status === "complete"), "Working polish state keeps per-track completion status");

    sessionStorage.setItem("audio-polish-checks", JSON.stringify(checks));
    sessionStorage.setItem("audio-polish-saved", JSON.stringify({ ids: saved.ids }));
    sessionStorage.setItem("audio-polish-reloaded", "1");
    location.reload();
  }

  run().catch((err) => {
    log(false, err && err.message ? err.message : String(err));
    finish();
  });
})();
`;

function injectedIndex() {
  const html = readFileSync(join(root, "index.html"), "utf8");
  return html.replace("</body>", `<script>${testScript}</script></body>`);
}

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const rel = req.url === "/" ? "/index.html" : req.url.split("?")[0];
      if (rel === "/audio-polish-test.html") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(injectedIndex());
        return;
      }
      const file = join(root, rel.replace(/^\//, ""));
      if (!file.startsWith(root) || !existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": mime(file) });
      res.end(readFileSync(file));
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function chromePath() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path));
}

function runChrome(chrome, userDataDir) {
  return new Promise((resolve) => {
    const child = spawn(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--virtual-time-budget=8000",
      `--user-data-dir=${userDataDir}`,
      "--dump-dom",
      `http://127.0.0.1:${port}/audio-polish-test.html`,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function parseResults(dom) {
  const match = dom.match(new RegExp(`<pre id="${resultId}">([\\s\\S]*?)<\\/pre>`));
  if (!match) {
    throw new Error("Browser test did not produce a result block.");
  }
  return JSON.parse(match[1]);
}

async function main() {
  const chrome = chromePath();
  if (!chrome) {
    throw new Error("No Chrome/Chromium binary found for browser acceptance.");
  }

  const server = await startServer();
  const userDataDir = mkdtempSync(join(tmpdir(), "pdc-audio-polish-"));
  let failed = false;
  try {
    const run = await runChrome(chrome, userDataDir);
    if (run.code !== 0) {
      console.error(run.stderr);
      process.exit(run.code || 1);
    }
    const results = parseResults(run.stdout);
    results.checks.forEach((item) => {
      console.log(`${item.ok ? "  ok" : " FAIL"} ${item.msg}`);
      if (!item.ok) failed = true;
    });
  } finally {
    server.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }

  if (failed) {
    process.exit(1);
  }
  console.log("\nBrowser audio polish processing: all checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

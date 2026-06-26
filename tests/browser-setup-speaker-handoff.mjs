// Running-product acceptance for canonical setup speaker handoff (#182).
// Run: node tests/browser-setup-speaker-handoff.mjs
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8768;

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

async function completeSetupWithAssignedSpeakers(page) {
  await page.getByRole("button", { name: "Start blank episode" }).click();
  await page.waitForSelector("form.setup-import");
  await page.locator("#f-episodeName").fill("Founders Unfiltered — Episode 1");
  await page.locator("#f-riversideLink").fill("https://riverside.fm/studio/founders-ep1");
  await page.locator("#f-sp-0-name").fill("Sam Rivera");
  await page.locator("#f-sp-1-name").fill("Dana Kim");
  await page.locator("#f-sp-2-name").fill("Alex Chen");
  await page.locator(".setup-preset-card").first().click();
  await page.getByRole("button", { name: "Continue to audio polish →" }).click();
  await page.locator(".guided-workspace").waitFor({ state: "visible" });
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
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

    await completeSetupWithAssignedSpeakers(page);

    const recapText = await page.locator(".setup-completion-recap").innerText();
    log(recapText.includes("Sam Rivera"), "Workspace recap shows Sam Rivera");
    log(recapText.includes("Dana Kim"), "Workspace recap shows Dana Kim");
    log(recapText.includes("Alex Chen"), "Workspace recap shows Alex Chen");
    log(!/canvas demo/i.test(recapText), "Workspace recap hides canvas demo stray text");
    log(!/Host · Host/.test(recapText), "Workspace recap avoids duplicated Host role text");
    log((recapText.match(/Host/g) || []).length <= 2, "Host bucket appears without duplicate role spam");

    await page.locator("#workspace-primary-next, .workspace-checklist-open").filter({ hasText: "Polish audio" }).first().click();
    await page.locator(".audio-step").waitFor();
    const audioText = await page.locator(".audio-step").innerText();
    log(audioText.includes("Sam Rivera"), "Audio polish step keeps Sam Rivera");
    log(audioText.includes("Dana Kim"), "Audio polish step keeps Dana Kim");
    log(audioText.includes("Alex Chen"), "Audio polish step keeps Alex Chen");
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  if (failed) {
    process.exitCode = 1;
    console.log("\nsetup speaker handoff browser acceptance: FAILED");
    return;
  }
  console.log("\nsetup speaker handoff browser acceptance: passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

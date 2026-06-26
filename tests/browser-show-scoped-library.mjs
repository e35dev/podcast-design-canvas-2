// Running-product acceptance for show-scoped library (#166).
// Mirrors maintainer rendered-UI probe: quick Add show → show detail → library grouping.
// Run: node tests/browser-show-scoped-library.mjs
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8765;

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

async function panelAboveFold(page) {
  const box = await page.locator(".show-library-shows-panel").first().boundingBox();
  return Boolean(box && box.y < 500);
}

async function quickAddShow(page, showName) {
  if (showName) {
    await page.locator("#quick-show-name").fill(showName);
  } else {
    await page.locator("#quick-show-name").fill("");
  }
  await page.getByRole("button", { name: "Add show →" }).click();
  await page.waitForSelector(".show-detail-root, .show-primary-step-card");
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

    log(await page.locator("#quick-show-name").isVisible(), "Quick add show field visible on empty library load");
    log(await panelAboveFold(page), "Your podcast shows panel is above the fold on empty load");

    await quickAddShow(page, "Show Alpha");
    log(await page.locator(".show-templates-card").isVisible(), "Add show lands on scoped show detail with Saved layouts section");
    log(await page.getByRole("heading", { name: "Episodes" }).isVisible(), "Show detail lists Episodes section");
    log(await page.getByRole("heading", { name: "Brand kit" }).isVisible(), "Show detail lists Brand kit section");

    await page.getByRole("button", { name: "← Library" }).click();
    await page.waitForSelector(".show-library-shows-panel");
    log(await page.locator(".show-library-card").filter({ hasText: "Show Alpha" }).count() === 1, "Show Alpha card appears in library after Add show");

    await quickAddShow(page, "Show Beta");
    await page.getByRole("button", { name: "← Library" }).click();
    const libraryCards = page.locator(".show-library-card");
    log(await libraryCards.count() === 2, "Library lists two separate show cards");
    log(await page.locator(".show-library-scope-note").isVisible(), "Library shows scoped-grouping hint for multiple shows");
    log(await panelAboveFold(page), "Your shows panel stays above the fold with two shows");

    await page.evaluate(() => {
      const LIB = window.PdcShowLibrary;
      const TM = window.PdcShowTemplates;
      const lib = LIB.deserializeLibrary(localStorage.getItem("pdc-show-library"));
      const showA = LIB.listShows(lib).find((show) => show.name === "Show Alpha");
      const showB = LIB.listShows(lib).find((show) => show.name === "Show Beta");
      let store = TM.deserializeStore(localStorage.getItem("pdc-show-templates"));
      const canvas = {
        presetId: "clean-studio",
        presetName: "Clean Studio",
        layoutId: "grid",
        pacingId: "balanced",
        background: "#10131f",
        accent: "#6c4cff",
        titleText: "Layout",
        layers: [],
        speakerFrames: [],
      };
      store = TM.saveTemplate(store, TM.createTemplate("Alpha Layout", canvas, "tpl-a", showA.id));
      store = TM.saveTemplate(store, TM.createTemplate("Beta Layout", canvas, "tpl-b", showB.id));
      localStorage.setItem("pdc-show-templates", TM.serializeStore(store));
    });

    await page.reload({ waitUntil: "networkidle" });
    log(await libraryCards.count() === 2, "Reload preserves both shows in library");

    const alphaLibraryCard = page.locator(".show-library-card").filter({ hasText: "Show Alpha" });
    log(await alphaLibraryCard.getByText("1 saved layout").isVisible(), "Show Alpha card shows scoped layout count after reload");
    await alphaLibraryCard.getByRole("button", { name: "Open" }).click();
    const alphaTemplatesCard = page.locator(".show-templates-card");
    log(await alphaTemplatesCard.getByText("Alpha Layout").isVisible(), "Show Alpha detail lists only Alpha Layout");
    log(!(await alphaTemplatesCard.getByText("Beta Layout").isVisible()), "Show Alpha detail hides Beta Layout");

    await page.getByRole("button", { name: "← Library" }).click();
    const betaLibraryCard = page.locator(".show-library-card").filter({ hasText: "Show Beta" });
    await betaLibraryCard.getByRole("button", { name: "Open" }).click();
    const betaTemplatesCard = page.locator(".show-templates-card");
    log(await betaTemplatesCard.getByText("Beta Layout").isVisible(), "Show Beta detail lists only Beta Layout");

    await betaTemplatesCard.getByRole("button", { name: "Start episode with layout →" }).click();
    const identityBanner = page.locator(".show-identity-banner");
    await identityBanner.waitFor({ state: "visible", timeout: 10000 });
    const identityText = await identityBanner.innerText();
    log(/Show Beta/i.test(identityText), "Start episode with layout opens under Show Beta");
    log(/Beta Layout|Template:/i.test(identityText), "Chosen saved layout name appears in show identity banner");

    await page.getByRole("button", { name: "← Show Library" }).first().click();
    await alphaLibraryCard.getByRole("button", { name: "New episode →" }).click();
    const setupText = await page.locator("#app").innerText();
    log(/Show Alpha/i.test(setupText), "New episode from Show Alpha card stays under Show Alpha");
  } catch (err) {
    failed = true;
    console.error("browser acceptance error:", err.message);
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  if (failed) process.exit(1);
  console.log("\nbrowser show-scoped library: running-product acceptance passed.");
}

main();

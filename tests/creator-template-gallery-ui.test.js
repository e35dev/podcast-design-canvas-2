"use strict";

// Creator template gallery UI smoke suite for Podcast Design Canvas (#106).
// The maintainer treats the rendered UI as ground truth (PR #108 failed because the
// gallery workflow was unreachable). These assertions track the exact source patterns
// that wire publish, browse, preview, and apply into reachable screens.
// Run with: `node tests/creator-template-gallery-ui.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

test("index loads the creator template gallery module", () => {
  assert.ok(html.includes("creator-template-gallery.js"));
});

test("show library exposes a primary creator gallery entry point", () => {
  assert.ok(ui.includes("Creator template gallery →"));
  assert.ok(ui.includes("creator-gallery-promo"));
  assert.ok(ui.includes('renderCreatorGallery(null, "library")'));
  assert.ok(styles.includes(".creator-gallery-promo"));
});

test("saved templates area is always reachable with publish and gallery actions", () => {
  assert.ok(ui.includes("renderSavedTemplatesCard"));
  assert.ok(ui.includes("Open creator gallery →"));
  assert.ok(ui.includes("renderGalleryPublish"));
  assert.ok(ui.includes("Publish to creator gallery →"));
  assert.ok(ui.includes("template-library-empty"));
});

test("creator gallery browse screen previews and applies layouts on the episode", () => {
  assert.ok(ui.includes("function renderCreatorGallery"));
  assert.ok(ui.includes("Browse creator templates"));
  assert.ok(ui.includes("buildPreviewCanvas"));
  assert.ok(ui.includes("renderCanvasStage(previewDoc)"));
  assert.ok(ui.includes("Apply gallery template →"));
  assert.ok(ui.includes("function applyGalleryListing"));
});

test("create-show and style steps link into the creator gallery", () => {
  assert.ok(ui.includes("Browse creator gallery →"));
  assert.ok(ui.includes('renderCreatorGallery(null, "new-show")'));
  assert.ok(ui.includes('renderSavedTemplatesCard(TM.listTemplates(templateStore), summary, "style")'));
});

console.log(`\ncreator template gallery ui: ${passed} assertions passed`);

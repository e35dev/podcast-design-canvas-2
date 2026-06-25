"use strict";

// Gallery copy polish smoke suite for Podcast Design Canvas (#117).
// Run with: `node tests/gallery-copy.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const gallery = require("../app/creator-template-gallery.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");

const forbiddenVisibleCopy = [
  "Try publish flow",
  "To submit flow",
  "Edit Bugs",
  "Gallery walkthrough",
  "Load demo gallery",
  "Optional demos",
  "Try style preset cards",
  "creator-share",
];

test("home screen and gallery UI avoid internal or dev-facing labels", () => {
  forbiddenVisibleCopy.forEach((label) => {
    assert.ok(!ui.includes(`"${label}"`), `unexpected dev label in UI source: ${label}`);
  });
  assert.ok(ui.includes("Publish a template"));
  assert.ok(ui.includes("Browse creator gallery →"));
  assert.ok(ui.includes("Preview style presets"));
  assert.ok(ui.includes("Browse featured templates →"));
});

test("displayStyleTags formats creator-facing template labels", () => {
  const tags = gallery.displayStyleTags(["split-stage", "interview", "creator-share", "Bold captions"]);
  assert.deepStrictEqual(tags, ["Split Stage", "Interview", "Bold captions"]);
});

test("ACCEPTANCE: gallery cards use plain product language for template status", () => {
  assert.ok(ui.includes("galleryListingStatusLine"));
  assert.ok(ui.includes("GAL.displayStyleTags"));
  assert.ok(ui.includes('"Interview", "Split stage", "Multi-speaker"'));
});

test("gallery previews hide editor layer chrome and use named sample speakers", () => {
  assert.ok(ui.includes("renderGalleryStagePreview"));
  const galleryPreviewFn = ui.slice(
    ui.indexOf("function renderGalleryStagePreview"),
    ui.indexOf("function renderCanvasStage"),
  );
  assert.ok(!galleryPreviewFn.includes("shortLayerLabel"));
  assert.ok(ui.includes("hasNamedSpeakers"));
  assert.ok(!ui.includes('"Unnamed speaker"'));
});

console.log(`\ngallery copy: ${passed} assertions passed`);

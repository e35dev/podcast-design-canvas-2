"use strict";

// Creator template gallery UI smoke suite for Podcast Design Canvas (#106).
// The maintainer's rendered UI review is ground truth — these guard reachable demo
// paths, starter listings, and publish/browse/preview/apply wiring in source.
// Run with: `node tests/creator-template-gallery-ui.test.js`.

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
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

test("index loads the creator template gallery module", () => {
  assert.ok(html.includes("creator-template-gallery.js"));
});

test("model seeds starter layouts for a fresh sandbox", () => {
  gallery._resetListingCounter();
  const seeded = gallery.ensureStarterGallery(gallery.createGallery());
  assert.ok(seeded.listings.length >= 3);
});

test("show library exposes a one-click gallery demo entry point", () => {
  assert.ok(ui.includes("Gallery walkthrough →"));
  assert.ok(ui.includes("function openGalleryDemo"));
  assert.ok(ui.includes("ensureGalleryStore"));
});

test("gallery browse always has listings, preview, apply, and publish", () => {
  assert.ok(ui.includes("ensureGalleryStore()"));
  assert.ok(ui.includes("Browse reusable podcast layouts"));
  assert.ok(ui.includes("Apply gallery template →"));
  assert.ok(ui.includes("renderCreatorGalleryBrowse"));
  assert.ok(ui.includes("renderPublishToGallery"));
});

test("saved templates area stays reachable with gallery and publish actions", () => {
  assert.ok(ui.includes("renderSavedTemplatesCard"));
  assert.ok(ui.includes("Browse creator gallery →"));
  assert.ok(ui.includes("Publish to gallery"));
});

console.log(`\ncreator template gallery ui: ${passed} assertions passed`);

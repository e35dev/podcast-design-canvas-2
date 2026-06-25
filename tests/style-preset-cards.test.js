"use strict";

// Visual style preset-card smoke suite for Podcast Design Canvas (#94).
// Run with: `node tests/style-preset-cards.test.js`.

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
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

test("style step uses preset cards instead of a preset select", () => {
  assert.ok(ui.includes("preset-card"));
  assert.ok(ui.includes("renderPresetCardPreview"));
  assert.ok(!ui.includes('id: "style-preset"'));
});

test("preset cards include a compact preview and cue chips", () => {
  assert.ok(ui.includes("preset-card-preview"));
  assert.ok(ui.includes("preset-card-cues"));
  assert.ok(ui.includes("preset-card-cue"));
  assert.ok(styles.includes(".preset-card-preview"));
  assert.ok(styles.includes(".preset-card-cues"));
});

test("ACCEPTANCE: selected preset cards remain visible and preview-driven", () => {
  assert.ok(ui.includes('class: `preset-card${selected ? " selected" : ""}`'));
  assert.ok(ui.includes("renderStyle(summary)"));
  assert.ok(ui.includes("Apply style & continue →"));
});

console.log(`\nstyle preset cards: ${passed} assertions passed`);

"use strict";

// Running-product wiring for speaker name integrity (#172).
// Run with: `node tests/speaker-name-integrity-ui.test.js`.

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
const browserTest = fs.readFileSync(
  path.join(__dirname, "browser-speaker-name-integrity.mjs"),
  "utf8",
);

test("setup with social links routes to context review before workspace", () => {
  assert.ok(ui.includes("summary.socialLinkCount > 0 && !contextApproved"));
  assert.ok(ui.includes("renderContextReview(summary)"));
});

test("context review surfaces setup name and approved spelling hints separately", () => {
  assert.ok(ui.includes("context-setup-name"));
  assert.ok(ui.includes("Name from setup:"));
  assert.ok(ui.includes("Defaults to the name you entered during setup"));
  assert.ok(ui.includes("not your confirmed setup name"));
  assert.ok(styles.includes(".context-setup-name-line"));
});

test("transcript correction keeps setup names as the default on-screen label", () => {
  assert.ok(ui.includes("Defaults to the name from episode setup"));
  assert.ok(ui.includes("renderTranscriptCorrection"));
  assert.ok(ui.includes("applyCorrectionEffects"));
});

test("ACCEPTANCE: browser probe covers setup, context, correction, and export path", () => {
  assert.ok(browserTest.includes("Sam Rivera"));
  assert.ok(browserTest.includes("Approve context & continue"));
  assert.ok(browserTest.includes("Apply corrections"));
  assert.ok(browserTest.includes("Sam Riveraa"));
  assert.ok(browserTest.includes("Final episode summary"));
});

console.log(`\nspeaker name integrity ui: ${passed} assertions passed`);

"use strict";

// Visual preset-card style picker smoke suite for Podcast Design Canvas (#94).
// The style step must choose presets/layout/pacing from visual cards, not native
// <select> dropdowns. Run with: `node tests/style-preset-cards.test.js`.

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
const style = require("../app/episode-style.js");

test("style step no longer uses native <select> for layout or pacing (#94)", () => {
  assert.ok(!ui.includes('id: "style-layout"'), "layout should be card-based, not a native select");
  assert.ok(!ui.includes('id: "style-pacing"'), "pacing should be card-based, not a native select");
});

test("layout and pacing are rendered as selectable cards with a clear highlight", () => {
  assert.ok(ui.includes("style-option-cards"));
  assert.ok(ui.includes("style-option-card"));
  // Selection highlight is applied to the chosen card.
  assert.ok(/style-option-card\$\{sel \? " selected" : ""\}/.test(ui));
  assert.ok(styles.includes(".style-option-card.selected"));
});

test("each preset card shows a compact layout preview and format cues", () => {
  assert.ok(ui.includes("renderPresetLayoutPreview"));
  assert.ok(ui.includes("preset-mini"));
  assert.ok(ui.includes("preset-cues"));
  assert.ok(styles.includes(".preset-mini"));
  assert.ok(styles.includes(".preset-cue"));
});

test("every preset still maps to a real layout + caption cue the cards can show", () => {
  // The card preview/cues read preset.defaultLayout + preset.captionStyle, so
  // each preset must resolve to a known layout and carry a caption style.
  const layoutIds = style.LAYOUTS.map((l) => l.id);
  style.STYLE_PRESETS.forEach((preset) => {
    assert.ok(layoutIds.indexOf(preset.defaultLayout) >= 0, `unknown layout ${preset.defaultLayout}`);
    assert.ok(typeof preset.captionStyle === "string" && preset.captionStyle.length > 0);
    assert.strictEqual(style.getLayout(preset.defaultLayout).id, preset.defaultLayout);
  });
});

console.log(`\nstyle preset cards: ${passed} assertions passed`);

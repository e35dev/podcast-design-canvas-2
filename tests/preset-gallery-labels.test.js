"use strict";

// Preset gallery label clarity smoke suite for Podcast Design Canvas (#128).
// Run with: `node tests/preset-gallery-labels.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const style = require("../app/episode-style.js");
const preview = require("../app/style-preview.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");

test("galleryCardChromeTitle gives each preset a distinct card headline", () => {
  const sharedEpisodeTitle = preview.sampleEpisodeSummary("Founders Unfiltered").episodeName;
  const titles = style.STYLE_PRESETS.map((preset) => {
    const look = preview.buildEpisodeLook(preset.id, { showName: "Founders Unfiltered" });
    const title = preview.galleryCardChromeTitle(look);
    assert.notStrictEqual(title, sharedEpisodeTitle, `${preset.id} should not repeat the sample episode title`);
    return title;
  });
  assert.strictEqual(new Set(titles).size, style.STYLE_PRESETS.length);
});

test("preset cards expose name, tagline, and format cue in create-show flow", () => {
  assert.ok(ui.includes("create-show-preset-name"));
  assert.ok(ui.includes("create-show-preset-tagline"));
  assert.ok(ui.includes("create-show-preset-format"));
  assert.ok(ui.includes("galleryCardChromeTitle"));
  assert.ok(ui.includes("preset-format-cue create-show-preset-format"));
});

test("card previews use gallery chrome titles while hero previews keep episode titles", () => {
  const look = preview.buildEpisodeLook("split-stage", { showName: "Founders Unfiltered" });
  assert.strictEqual(preview.galleryCardChromeTitle(look), "Building in public");
  assert.ok(look.episodeTitle.includes("Founders Unfiltered"));
  assert.ok(look.episodeTitle.includes("Episode 12"));
});

test("ACCEPTANCE: create-show preset grid labels are distinct before selection", () => {
  const names = style.STYLE_PRESETS.map((preset) => preset.name);
  const taglines = style.STYLE_PRESETS.map((preset) => preset.tagline);
  const chromeTitles = style.STYLE_PRESETS.map((preset) => {
    const look = preview.buildEpisodeLook(preset.id);
    return preview.galleryCardChromeTitle(look);
  });

  assert.strictEqual(new Set(names).size, style.STYLE_PRESETS.length);
  assert.strictEqual(new Set(taglines).size, style.STYLE_PRESETS.length);
  assert.strictEqual(new Set(chromeTitles).size, style.STYLE_PRESETS.length);

  style.STYLE_PRESETS.forEach((preset) => {
    const summary = style.presetCardSummary(preset);
    assert.ok(summary.formatCue.includes(preset.captionStyle));
  });
});

console.log(`\npreset gallery labels: ${passed} assertions passed`);

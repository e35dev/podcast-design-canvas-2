"use strict";

// Rich preset episode-preview smoke suite for Podcast Design Canvas (#102).
//
// Guards the acceptance for "make style presets preview real episode layouts": the new-show
// setup is preset-first with large, realistic episode previews (themed speaker frames, a
// title treatment, a burned-in caption, an on-brand overlay, and pacing cues), every named
// preset is visibly distinct, the selected preset stays highlighted while a larger preview
// updates, the show name is preserved across preset switches, Blank show is secondary, and
// no native <select> remains for template/style/layout/pacing.
// The rendered UI is the maintainer's ground truth (prior PR #103 passed tests but its
// previews were still abstract blocks), so these track the exact patterns that render them.
// Run with: `node tests/style-preset-previews.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const style = require("../app/episode-style.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

test("buildRichPreviewModel returns realistic multi-speaker frames, title, caption, overlay", () => {
  const model = style.buildRichPreviewModel(style.getPreset("studio-spotlight"), null, {});
  assert.strictEqual(model.frames.length, 3, "uses sample three-speaker content");
  model.frames.forEach((frame) => {
    assert.ok(frame.initials, "each speaker frame has initials");
    assert.ok(/linear-gradient/.test(frame.tint), "each frame has a themed video tint");
    assert.ok(frame.role && frame.name, "each frame carries role + name for a lower-third");
  });
  assert.ok(model.captionText, "has a burned-in caption");
  assert.ok(model.overlayLabel, "has an on-brand overlay");
  assert.ok(model.titleText, "has an episode title treatment");
  assert.ok(model.cutCount >= 1, "carries a pacing cue (timeline cut count)");
  assert.ok(model.theme.accent && model.theme.background, "carries the preset theme");
});

test("every named preset previews a visibly distinct episode", () => {
  const titles = new Set();
  const overlays = new Set();
  const captions = new Set();
  style.STYLE_PRESETS.forEach((preset) => {
    const model = style.buildRichPreviewModel(preset, null, {});
    titles.add(model.episodeTitle);
    overlays.add(model.overlayLabel);
    captions.add(model.captionText);
  });
  assert.strictEqual(titles.size, style.STYLE_PRESETS.length, "distinct episode titles per preset");
  assert.strictEqual(overlays.size, style.STYLE_PRESETS.length, "distinct overlays per preset");
  assert.strictEqual(captions.size, style.STYLE_PRESETS.length, "distinct captions per preset");
});

test("show name flows into the preview title and is preserved across presets", () => {
  const a = style.buildRichPreviewModel(style.getPreset("split-stage"), null, { showName: "Founders Unfiltered" });
  const b = style.buildRichPreviewModel(style.getPreset("panel-grid"), null, { showName: "Founders Unfiltered" });
  assert.strictEqual(a.titleText, "Founders Unfiltered");
  assert.strictEqual(b.titleText, "Founders Unfiltered", "the show name carries across preset switches");
  const blank = style.buildRichPreviewModel(style.getPreset("split-stage"), null, {});
  assert.strictEqual(blank.titleText, blank.episodeTitle, "falls back to a sample episode title with no show name");
});

test("layout resolves so spotlight features one speaker and grids show the panel", () => {
  const spotlight = style.buildRichPreviewModel(style.getPreset("studio-spotlight"), null, {});
  assert.strictEqual(spotlight.layoutId, "spotlight");
  assert.ok(spotlight.frames.some((f) => f.active), "spotlight features an active speaker");
  const grid = style.buildRichPreviewModel(style.getPreset("panel-grid"), null, {});
  assert.strictEqual(grid.layoutId, "grid");
});

test("create-show setup is preset-first with a large live preview and no native selects", () => {
  assert.ok(ui.includes("create-show-layout"), "two-column preset-first layout");
  assert.ok(ui.includes("create-show-preset-grid"), "renders a preset card grid");
  assert.ok(ui.includes("renderRichEpisodePreview"), "renders realistic episode previews");
  assert.ok(ui.includes("create-show-main-preview"), "has a large live preview panel");
  assert.ok(ui.includes('class: `rich-preset-card${selected ? " selected" : ""}`'), "highlights the selected preset card");
  assert.ok(!ui.includes('el("select", { id: "f-show-template" }'), "template picker is not a native select");
  assert.ok(!ui.includes('el("select", { id: "style-layout" }'), "layout picker is not a native select");
  assert.ok(!ui.includes('el("select", { id: "style-pacing" }'), "pacing picker is not a native select");
});

test("Blank show and saved templates are secondary, not primary", () => {
  assert.ok(ui.includes("create-show-secondary"), "secondary options live in a disclosure");
  assert.ok(ui.includes("Or start blank / use a saved template"), "blank/templates are tucked away");
  assert.ok(ui.includes("Blank show"), "blank show is offered as a secondary choice");
});

test("realistic preview styles exist (video tiles, lower-thirds, captions, layouts)", () => {
  assert.ok(styles.includes(".rich-ep-stage"), "preview stage styles");
  assert.ok(styles.includes(".rich-ep-tile"), "speaker video tile styles");
  assert.ok(styles.includes(".rich-ep-lowerthird"), "speaker name lower-third styles");
  assert.ok(styles.includes(".rich-ep-caption"), "burned-in caption styles");
  assert.ok(styles.includes(".stage-spotlight .rich-ep-frames"), "layout-specific framing");
  assert.ok(styles.includes(".rich-preset-card"), "preset card styles");
  assert.ok(styles.includes(".create-show-layout"), "create-show layout styles");
});

console.log(`\nstyle preset previews: ${passed} assertions passed`);

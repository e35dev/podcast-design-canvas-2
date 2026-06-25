"use strict";

// Preset preview distinction smoke suite for Podcast Design Canvas (#120).
// Run with: `node tests/preset-preview-distinction.test.js`.

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
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

test("each preset exposes a unique visual profile for previews", () => {
  const signatures = style.STYLE_PRESETS.map((preset) => {
    const look = preview.buildEpisodeLook(preset.id, { showName: "Founders Unfiltered" });
    return preview.previewVisualSignature(look);
  });
  assert.strictEqual(new Set(signatures).size, style.STYLE_PRESETS.length);
});

test("preset previews differ in layout, caption treatment, and overlay tone", () => {
  const looks = style.STYLE_PRESETS.map((preset) => preview.buildEpisodeLook(preset.id));
  const layouts = new Set(looks.map((look) => look.layoutId));
  const captions = new Set(looks.map((look) => look.captionTreatment));
  const overlays = new Set(looks.map((look) => look.overlayLabel));
  const backgrounds = new Set(looks.map((look) => look.theme.background));

  assert.ok(layouts.size >= 3, "presets should use at least three distinct layout structures");
  assert.strictEqual(captions.size, style.STYLE_PRESETS.length);
  assert.strictEqual(overlays.size, style.STYLE_PRESETS.length);
  assert.strictEqual(backgrounds.size, style.STYLE_PRESETS.length);
  assert.ok(looks.some((look) => look.overlayLabel === "Episode 12"));
  assert.ok(looks.some((look) => look.overlayLabel === "Roundtable"));
  assert.ok(looks.some((look) => look.overlayLabel === "On air"));
});

test("UI and styles render preset-specific preview classes", () => {
  assert.ok(ui.includes("caption-${look.captionTreatment}"));
  assert.ok(ui.includes("stage-${look.layoutId}"));
  assert.ok(ui.includes("preset-${look.presetId}"));
  assert.ok(styles.includes(".stage-broadcast"));
  assert.ok(styles.includes(".caption-broadcast-banner"));
  assert.ok(styles.includes(".caption-caption-bar"));
  assert.ok(styles.includes(".preset-split-stage"));
});

test("ACCEPTANCE: a reviewer can identify each preset from preview metadata alone", () => {
  const byPreset = {};
  style.STYLE_PRESETS.forEach((preset) => {
    const look = preview.buildEpisodeLook(preset.id);
    byPreset[preset.id] = {
      layoutId: look.layoutId,
      overlayLabel: look.overlayLabel,
      captionTreatment: look.captionTreatment,
      pacingId: look.pacingId,
      background: look.theme.background,
      captionText: look.captionText,
    };
  });

  assert.strictEqual(byPreset["split-stage"].layoutId, "split");
  assert.strictEqual(byPreset["panel-grid"].layoutId, "grid");
  assert.strictEqual(byPreset["bold-broadcast"].layoutId, "broadcast");
  assert.strictEqual(byPreset["studio-spotlight"].layoutId, "spotlight");
  assert.notStrictEqual(byPreset["studio-spotlight"].background, byPreset["split-stage"].background);
  assert.notStrictEqual(byPreset["bold-broadcast"].captionTreatment, byPreset["panel-grid"].captionTreatment);
  assert.notStrictEqual(byPreset["studio-spotlight"].captionText, byPreset["bold-broadcast"].captionText);
});

console.log(`\npreset preview distinction: ${passed} assertions passed`);

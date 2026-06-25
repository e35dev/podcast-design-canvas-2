"use strict";

// Preset preview distinctness smoke suite for Podcast Design Canvas (#120).
// Run with: `node tests/preset-preview-distinct.test.js`.

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

function lookSignature(look) {
  return [
    look.layoutId,
    look.frameMode,
    look.captionVariant,
    look.pacingId,
    look.overlayLabel,
    look.theme.background,
    look.theme.accent,
  ].join("|");
}

test("each preset profile uses a distinct caption variant and default pacing", () => {
  const variants = new Set();
  const pacing = new Set();
  style.STYLE_PRESETS.forEach((preset) => {
    const profile = preview.getVisualProfile(preset.id);
    variants.add(profile.captionVariant);
    pacing.add(profile.pacing);
  });
  assert.strictEqual(variants.size, style.STYLE_PRESETS.length);
  assert.ok(pacing.size >= 3);
});

test("buildEpisodeLook produces clearly different layout and framing per preset", () => {
  const looks = style.STYLE_PRESETS.map((preset) => preview.buildEpisodeLook(preset.id, { showName: "Demo Show" }));
  const signatures = new Set(looks.map(lookSignature));
  assert.strictEqual(signatures.size, style.STYLE_PRESETS.length);

  const founders = looks.find((look) => look.presetId === "split-stage");
  const panel = looks.find((look) => look.presetId === "panel-grid");
  const onAir = looks.find((look) => look.presetId === "bold-broadcast");
  assert.strictEqual(founders.frameMode, "duo");
  assert.strictEqual(founders.frames.length, 2);
  assert.strictEqual(panel.frameMode, "panel-row");
  assert.strictEqual(panel.frames.length, 3);
  assert.strictEqual(onAir.overlayLabel, "ON AIR");
  assert.strictEqual(onAir.captionVariant, "broadcast");
});

test("UI renders preset-specific preview classes for caption, title, pacing, and framing", () => {
  assert.ok(ui.includes("caption-${look.captionVariant}"));
  assert.ok(ui.includes("frame-${look.frameMode}"));
  assert.ok(ui.includes("pacing-${look.pacingId}"));
  assert.ok(ui.includes("episode-look-pacing-meter"));
  assert.ok(styles.includes(".frame-panel-row"));
  assert.ok(styles.includes(".caption-broadcast"));
  assert.ok(styles.includes(".preset-split-stage"));
  assert.ok(styles.includes(".preset-bold-broadcast"));
});

test("ACCEPTANCE: nontechnical preset identity is readable from preview model alone", () => {
  const looks = style.STYLE_PRESETS.map((preset) => preview.buildEpisodeLook(preset.id));
  looks.forEach((look) => {
    assert.ok(look.overlayLabel);
    assert.ok(look.captionVariant);
    assert.ok(look.captionText);
    assert.ok(look.pacingLabel);
    assert.ok(look.frames.length >= 2);
  });

  const live = looks.find((look) => look.overlayLabel === "LIVE");
  const founders = looks.find((look) => look.overlayLabel === "Founders");
  const panel = looks.find((look) => look.overlayLabel === "Panel");
  const onAir = looks.find((look) => look.overlayLabel === "ON AIR");
  assert.ok(live && founders && panel && onAir);
  assert.notStrictEqual(live.layoutId, founders.layoutId);
  assert.notStrictEqual(panel.frameMode, onAir.captionVariant);
  assert.notStrictEqual(founders.captionVariant, panel.captionVariant);
});

console.log(`\npreset preview distinct: ${passed} assertions passed`);

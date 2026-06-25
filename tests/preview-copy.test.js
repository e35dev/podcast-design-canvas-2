"use strict";

// Preview copy polish smoke suite for Podcast Design Canvas (#126).
// Run with: `node tests/preview-copy.test.js`.

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
const canvasEditor = fs.readFileSync(path.join(__dirname, "../app/canvas-editor.js"), "utf8");

function visibleCopyFromLook(look) {
  return [
    look.captionText,
    look.topicLabel,
    look.lowerThird,
    look.overlayLabel,
    look.episodeTitle,
  ].join(" ").toLowerCase();
}

test("preset previews use natural podcast captions and labels", () => {
  style.STYLE_PRESETS.forEach((preset) => {
    const look = preview.buildEpisodeLook(preset.id, { showName: "Founders Unfiltered" });
    assert.ok(look.captionText.includes(":") || look.captionText.length > 12, `${preset.id} caption reads like dialogue or narration`);
    assert.ok(look.topicLabel, `${preset.id} includes a topic label`);
    assert.ok(look.lowerThird, `${preset.id} includes a lower-third line`);
  });
});

test("pacing changes update the preview caption text", () => {
  const relaxed = preview.buildEpisodeLookFromEpisode(
    "bold-broadcast",
    preview.sampleEpisodeSummary(),
    { presetId: "bold-broadcast", layout: "broadcast", pacing: "relaxed" },
  );
  const punchy = preview.buildEpisodeLookFromEpisode(
    "bold-broadcast",
    preview.sampleEpisodeSummary(),
    { presetId: "bold-broadcast", layout: "broadcast", pacing: "punchy" },
  );
  assert.notStrictEqual(relaxed.captionText, punchy.captionText);
});

test("forbidden placeholder phrases do not appear in preview copy", () => {
  const allCopy = style.STYLE_PRESETS
    .flatMap((preset) => {
      const looks = ["relaxed", "balanced", "punchy"].map((pacing) => preview.buildEpisodeLookFromEpisode(
        preset.id,
        preview.sampleEpisodeSummary(),
        { presetId: preset.id, pacing: pacing },
      ));
      looks.push(preview.buildEpisodeLook(preset.id));
      return looks;
    })
    .map(visibleCopyFromLook)
    .join("\n");

  preview.FORBIDDEN_PREVIEW_PHRASES.forEach((phrase) => {
    assert.ok(!allCopy.includes(phrase), `forbidden preview phrase found: ${phrase}`);
  });
  assert.ok(!canvasEditor.toLowerCase().includes("sample caption"));
  assert.ok(ui.includes("episode-look-topic"));
  assert.ok(ui.includes("episode-look-lower-third"));
});

test("ACCEPTANCE: gallery and create-show preview paths use polished sample text", () => {
  const split = preview.buildEpisodeLook("split-stage");
  assert.ok(split.captionText.includes("Dana:"));
  assert.strictEqual(split.overlayLabel, "Episode 12");

  const panel = preview.buildEpisodeLook("panel-grid");
  assert.strictEqual(panel.topicLabel, "Product strategy");
  assert.ok(panel.captionText.includes("Alex:"));

  const broadcast = preview.buildEpisodeLook("bold-broadcast");
  assert.ok(!broadcast.captionText.toLowerCase().includes("on air energy"));
  assert.ok(broadcast.captionText.toLowerCase().includes("founders"));
});

console.log(`\npreview copy: ${passed} assertions passed`);

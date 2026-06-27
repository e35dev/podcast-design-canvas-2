"use strict";

// Playable episode video export smoke suite (#30).
// Run with: `node tests/episode-video-export.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const audio = require("../app/audio-polish.js");
const video = require("../app/episode-video-export.js");

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function readyEpisode() {
  const draft = setup.prepareSandboxPresetHandoff(setup.createDraft(), "Founders Unfiltered");
  draft.episodeName = "Founders Unfiltered #7";
  draft.speakers.forEach((speaker, index) => {
    speaker.name = ["Sam Rivera", "Dana Kim", "Alex Chen"][index];
  });
  return setup.summarize(draft);
}

test("buildAssemblyPlan carries layout, speakers, and polished audio line", () => {
  const episode = readyEpisode();
  const selection = style.createSelection();
  const applied = style.summarizeStyle(selection, episode.speakerCount);
  const polish = audio.completedPolishSummary(episode);
  const plan = video.buildAssemblyPlan(episode, {
    appliedStyle: applied,
    audioPolish: polish,
  }, { resolution: "1080p" });
  assert.strictEqual(plan.width, 1920);
  assert.strictEqual(plan.height, 1080);
  assert.strictEqual(plan.speakers.length, 3);
  assert.ok(plan.speakers[0].initials);
  assert.ok(/polished WAV/i.test(plan.audioLine));
});

test("drawEpisodeFrame renders arranged speaker layout onto a canvas context", () => {
  const calls = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    fillRect: function () { calls.push("fillRect"); },
    strokeRect: function () { calls.push("strokeRect"); },
    fillText: function () { calls.push("fillText"); },
  };
  const plan = video.buildAssemblyPlan(readyEpisode(), {
    appliedStyle: { presetName: "Clean", layoutId: "split", background: "#10131f", accent: "#6c4cff" },
    audioPolish: audio.completedPolishSummary(readyEpisode()),
  }, { resolution: "720p" });
  video.drawEpisodeFrame(ctx, plan, 0.5);
  assert.ok(calls.indexOf("fillRect") >= 0);
  assert.ok(calls.indexOf("strokeRect") >= 0);
  assert.ok(calls.filter((item) => item === "fillText").length >= 3);
});

test("ACCEPTANCE: export screen wires playable video preview and download link", () => {
  assert.ok(ui.includes("runEpisodeVideoExport"));
  assert.ok(ui.includes("recordEpisodeVideo"));
  assert.ok(ui.includes("export-video-preview"));
  assert.ok(ui.includes("export-download-link"));
  assert.ok(ui.includes('id: "workspace-primary-next"'));
  assert.ok(styles.includes(".export-video-preview"));
});

console.log(`\nepisode video export: ${passed} assertions passed`);

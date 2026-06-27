"use strict";

// Audio polish processing handoff smoke suite for Podcast Design Canvas (#197).
// Run with: `node tests/audio-polish-processing.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");
const exportApi = require("../app/episode-export.js");
const review = require("../app/publish-review.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

function completeUploadDraft() {
  const draft = setup.createDraft();
  draft.episodeName = "Indie Makers Weekly — Episode 3";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Jordan Lee", fileName: "jordan.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Priya Shah", fileName: "priya.mp4" }),
  ];
  return draft;
}

test("validateReadiness requires processed polished audio, not just preset selection", () => {
  const episode = setup.summarize(completeUploadDraft());
  const selectedOnly = audio.summarizePolish(audio.createPolish(episode));
  assert.strictEqual(exportApi.validateReadiness({ audioPolish: selectedOnly, appliedStyle: { presetName: "Studio" } }).ok, false);

  const applied = audio.buildAppliedPolishSummary(episode);
  assert.strictEqual(exportApi.validateReadiness({ audioPolish: applied, appliedStyle: { presetName: "Studio" } }).ok, true);
});

test("publish review blocks export until polished tracks are saved", () => {
  const episode = setup.summarize(completeUploadDraft());
  const selectedOnly = audio.summarizePolish(audio.createPolish(episode));
  const blocked = review.createReview(episode, {
    audioPolish: selectedOnly,
    appliedStyle: { presetName: "Studio", layoutLabel: "Split" },
    contextApproved: true,
    momentsSummary: { total: 0 },
    captionCount: 0,
  });
  assert.ok(review.blockers(blocked).some((item) => item.id === "audio-incomplete"));

  const applied = audio.buildAppliedPolishSummary(episode);
  const ready = review.createReview(episode, {
    audioPolish: applied,
    appliedStyle: { presetName: "Studio", layoutLabel: "Split" },
    contextApproved: true,
    momentsSummary: { total: 0 },
    captionCount: 0,
  });
  assert.strictEqual(review.canApprove(ready), true);
});

test("UI wires apply processing, per-track status, and session persistence (#197)", () => {
  assert.ok(ui.includes("AP.applyPolish(audioPolish, summary)"));
  assert.ok(ui.includes("audioPolishState"));
  assert.ok(ui.includes("audio-track-status"));
  assert.ok(ui.includes("Polished asset:"));
  assert.ok(ui.includes("persistEpisodeSession()"));
  assert.ok(styles.includes(".audio-track-status-complete"));
  assert.ok(styles.includes(".audio-polish-complete"));
});

test("ACCEPTANCE: apply audio polish saves durable assets used by review and export", () => {
  const episode = setup.summarize(completeUploadDraft());
  const applied = audio.buildAppliedPolishSummary(episode);
  assert.strictEqual(applied.processingComplete, true);
  assert.strictEqual(applied.polishedTracks.length, 2);
  assert.ok(applied.polishedTracks.every((track) => track.polishedAssetId.includes("-polished.wav")));

  const restored = audio.deserializePolish(audio.serializePolish(
    audio.applyPolish(audio.createPolish(episode), episode).polish,
  ), episode);
  const restoredSummary = audio.summarizePolish(restored);
  assert.strictEqual(restoredSummary.processingComplete, true);
  assert.strictEqual(restoredSummary.polishedTracks[0].polishedAssetId, applied.polishedTracks[0].polishedAssetId);

  const exportSummary = exportApi.buildFinalSummary(episode, {
    audioPolish: applied,
    appliedStyle: { presetName: "Studio", layoutLabel: "Split", pacingLabel: "Balanced" },
  }, exportApi.createExport(episode));
  assert.ok(exportSummary.lines.some((line) => line.includes("polished track")));
  assert.ok(!exportSummary.lines.join(" ").includes("jordan.mp4"));
});

console.log(`\naudio polish processing: ${passed} assertions passed`);

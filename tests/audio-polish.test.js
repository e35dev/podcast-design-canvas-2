"use strict";

// Audio polish smoke suite for Podcast Design Canvas (#15).
// Guards quality presets, per-speaker tracks, control adjustments, and review summary.
// Run with: `node tests/audio-polish.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function completeUploadDraft() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal", fileName: "marco.mp4" }),
  ];
  return draft;
}

test("offers Natural, Clean, and Studio quality presets", () => {
  assert.strictEqual(audio.QUALITY_PRESETS.length, 3);
  const ids = audio.QUALITY_PRESETS.map((preset) => preset.id);
  assert.deepStrictEqual(ids, ["natural", "clean", "studio"]);
  audio.QUALITY_PRESETS.forEach((preset) => {
    assert.ok(preset.name && preset.tagline, `${preset.id} is described for creators`);
  });
});

test("createPolish seeds speaker tracks from the episode summary", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.createPolish(episode);
  assert.strictEqual(polish.presetId, "clean");
  assert.strictEqual(polish.speakers.length, 3);
  assert.deepStrictEqual(polish.speakers.map((track) => track.role), ["Host", "Guest 1", "Guest 2"]);
  assert.strictEqual(polish.speakers[0].sourceLabel, "sam.mp4");
});

test("applyPreset updates all polish controls", () => {
  const episode = setup.summarize(completeUploadDraft());
  let polish = audio.createPolish(episode);
  polish = audio.applyPreset(polish, "studio");
  assert.strictEqual(polish.presetId, "studio");
  assert.strictEqual(polish.noiseCleanup, "strong");
  assert.strictEqual(polish.leveling, "strong");
  assert.strictEqual(polish.speechClarity, "strong");
  assert.strictEqual(polish.enhancement, "strong");
});

test("updateControl changes a single polish dimension", () => {
  const episode = setup.summarize(completeUploadDraft());
  let polish = audio.createPolish(episode);
  polish = audio.updateControl(polish, "noiseCleanup", "light");
  assert.strictEqual(polish.noiseCleanup, "light");
  assert.strictEqual(polish.leveling, "balanced");
});

test("summarizePolish reflects the chosen treatment", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.applyPreset(audio.createPolish(episode), "natural");
  const summary = audio.summarizePolish(polish);
  assert.strictEqual(summary.presetName, "Natural");
  assert.strictEqual(summary.noiseCleanupLabel, "Light");
  assert.ok(summary.treatmentLine.includes("Noise cleanup: Light"));
  assert.strictEqual(summary.speakerCount, 3);
});

test("buildReviewSummary includes audio in the export path", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.summarizePolish(audio.createPolish(episode));
  const review = audio.buildReviewSummary(episode, polish, {
    styleName: "Studio Spotlight",
    templateName: "Founders Unfiltered",
  });
  assert.strictEqual(review.episodeName, "Founders Unfiltered #7");
  assert.strictEqual(review.audioPreset, "Clean");
  assert.strictEqual(review.styleName, "Studio Spotlight");
  assert.strictEqual(review.readyForExport, true);
  assert.ok(review.summaryLines.some((line) => line.indexOf("Audio:") === 0));
});

test("ACCEPTANCE: episode setup flows into audio polish and saves a review summary", () => {
  const draft = completeUploadDraft();
  assert.strictEqual(setup.validateDraft(draft).ok, true);

  const episode = setup.summarize(draft);
  let polish = audio.createPolish(episode);
  assert.strictEqual(polish.speakers.length, episode.speakerCount);

  polish = audio.applyPreset(polish, "clean");
  polish = audio.updateControl(polish, "speechClarity", "strong");
  const applied = audio.summarizePolish(polish);
  assert.strictEqual(applied.presetName, "Clean");
  assert.strictEqual(applied.speechClarityLabel, "Strong");

  const review = audio.buildReviewSummary(episode, applied, {});
  assert.strictEqual(review.readyForExport, true);
  assert.ok(review.audioTreatment.includes("Speech clarity: Strong"));
});

test("processPolish renders a real polished asset for every speaker track (#197)", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.applyPreset(audio.createPolish(episode), "studio");
  const processed = audio.processPolish(polish, episode, { processedAt: "fixed" });
  assert.strictEqual(processed.totalCount, 3);
  assert.strictEqual(processed.completedCount, 3);
  assert.strictEqual(processed.status, "complete");
  processed.tracks.forEach((track) => {
    assert.strictEqual(track.status, "polished");
    assert.ok(track.assetId, "each track saves a durable asset id");
    assert.ok(/dB/.test(track.metricLabel), "each track reports a measured metric");
    assert.ok(track.sourceFingerprint, "each asset is bound to its source");
  });
});

test("isPolishComplete gates completion and export consumes the assets (#197)", () => {
  const episode = setup.summarize(completeUploadDraft());
  const processed = audio.processPolish(audio.createPolish(episode), episode);
  assert.strictEqual(audio.isPolishComplete(processed), true);

  const durable = audio.summarizeProcessed(processed);
  assert.strictEqual(durable.treatedCount, 3);
  assert.strictEqual(durable.totalCount, 3);
  assert.strictEqual(durable.complete, true);
  assert.strictEqual(durable.assets.length, 3);
  // Export readiness now hinges on real polished assets, not a bare preset name.
  assert.strictEqual(audio.exportHasPolishedAudio(durable), true);
  assert.strictEqual(audio.exportHasPolishedAudio({ presetName: "Clean" }), false);
});

test("summarizeProcessed survives a JSON round-trip for reload persistence (#197)", () => {
  const episode = setup.summarize(completeUploadDraft());
  const processed = audio.processPolish(audio.createPolish(episode), episode, { processedAt: "fixed" });
  const durable = audio.summarizeProcessed(processed);
  const restored = JSON.parse(JSON.stringify(durable));
  assert.deepStrictEqual(restored, durable);
  assert.strictEqual(audio.exportHasPolishedAudio(restored), true);
  assert.strictEqual(restored.assets[0].metricLabel, durable.assets[0].metricLabel);
});

console.log(`\naudio polish: ${passed} assertions passed`);

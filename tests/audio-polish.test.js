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

test("REGRESSION (#197): choosing a preset alone does not make the episode export-ready", () => {
  const episode = setup.summarize(completeUploadDraft());
  // Only a preset has been picked — no track has actually been processed yet.
  const polish = audio.summarizePolish(audio.createPolish(episode));
  assert.strictEqual(polish.presetName, "Clean");
  assert.strictEqual(polish.allTracksProcessed, false);
  assert.strictEqual(polish.processedTrackCount, 0);

  const review = audio.buildReviewSummary(episode, polish, {});
  assert.strictEqual(review.readyForExport, false, "a chosen preset alone must not satisfy export readiness");
});

test("buildReviewSummary includes audio in the export path once every track is polished", () => {
  const episode = setup.summarize(completeUploadDraft());
  const processed = audio.processTracks(audio.createPolish(episode));
  const polish = audio.summarizePolish(processed);
  const review = audio.buildReviewSummary(episode, polish, {
    styleName: "Studio Spotlight",
    templateName: "Founders Unfiltered",
  });
  assert.strictEqual(review.episodeName, "Founders Unfiltered #7");
  assert.strictEqual(review.audioPreset, "Clean");
  assert.strictEqual(review.styleName, "Studio Spotlight");
  assert.strictEqual(review.readyForExport, true);
  assert.strictEqual(review.polishedTracks.length, 3);
  assert.ok(review.summaryLines.some((line) => line.indexOf("Audio:") === 0));
  assert.ok(review.summaryLines.some((line) => line.includes("3/3 tracks polished")));
});

test("speaker tracks start unprocessed and gain a saved output reference after processTracks", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.createPolish(episode);
  assert.ok(polish.speakers.every((track) => track.processed === false));
  assert.ok(polish.speakers.every((track) => !track.outputRef));

  const processed = audio.processTracks(polish);
  assert.strictEqual(audio.allTracksProcessed(processed), true);
  processed.speakers.forEach((track) => {
    assert.strictEqual(track.processed, true);
    assert.ok(track.outputRef, "processed track must have a saved polished output reference");
    assert.ok(typeof track.processedAt === "number");
  });
});

test("changing a control after processing makes tracks stale until reprocessed", () => {
  const episode = setup.summarize(completeUploadDraft());
  let polish = audio.processTracks(audio.createPolish(episode));
  assert.strictEqual(audio.allTracksProcessed(polish), true);

  // Adjusting a control changes intent but does not re-polish the tracks by itself.
  polish = audio.updateControl(polish, "noiseCleanup", "strong");
  assert.strictEqual(audio.allTracksProcessed(polish), false);
  assert.strictEqual(audio.summarizePolish(polish).allTracksProcessed, false);

  polish = audio.processTracks(polish);
  assert.strictEqual(audio.allTracksProcessed(polish), true);
});

test("restorePolish carries forward applied settings and still-valid polished tracks", () => {
  const episode = setup.summarize(completeUploadDraft());
  const applied = audio.summarizePolish(audio.processTracks(audio.applyPreset(audio.createPolish(episode), "studio")));
  assert.strictEqual(applied.allTracksProcessed, true);

  // Simulate reloading the episode: only the saved summary survives, the working
  // polish object is rebuilt from scratch.
  const restored = audio.restorePolish(episode, applied);
  assert.strictEqual(restored.presetId, "studio");
  assert.strictEqual(restored.noiseCleanup, "strong");
  assert.strictEqual(audio.allTracksProcessed(restored), true, "previously polished tracks should still count after reload");

  const restoredSummary = audio.summarizePolish(restored);
  assert.strictEqual(restoredSummary.allTracksProcessed, true);
  assert.strictEqual(restoredSummary.processedTrackCount, 3);
});

test("ACCEPTANCE: episode setup flows into audio polish and saves a review summary only once every track is polished", () => {
  const draft = completeUploadDraft();
  assert.strictEqual(setup.validateDraft(draft).ok, true);

  const episode = setup.summarize(draft);
  let polish = audio.createPolish(episode);
  assert.strictEqual(polish.speakers.length, episode.speakerCount);

  polish = audio.applyPreset(polish, "clean");
  polish = audio.updateControl(polish, "speechClarity", "strong");

  // Settings chosen but not yet applied to the tracks — not export-ready.
  const pending = audio.summarizePolish(polish);
  assert.strictEqual(pending.allTracksProcessed, false);
  assert.strictEqual(audio.buildReviewSummary(episode, pending, {}).readyForExport, false);

  // Applying processes every speaker track and saves its polished output.
  polish = audio.processTracks(polish);
  const applied = audio.summarizePolish(polish);
  assert.strictEqual(applied.presetName, "Clean");
  assert.strictEqual(applied.speechClarityLabel, "Strong");
  assert.strictEqual(applied.allTracksProcessed, true);
  assert.strictEqual(applied.processedTrackCount, episode.speakerCount);

  const review = audio.buildReviewSummary(episode, applied, {});
  assert.strictEqual(review.readyForExport, true);
  assert.ok(review.audioTreatment.includes("Speech clarity: Strong"));
});

console.log(`\naudio polish: ${passed} assertions passed`);

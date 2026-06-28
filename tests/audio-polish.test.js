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

function uploadDraftWithMissingSource() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #8";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "" }),
  ];
  return draft;
}

test("processTracks saves a polished output for every imported speaker track", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.applyPreset(audio.createPolish(episode), "studio");
  const result = audio.processTracks(polish, episode);

  assert.strictEqual(result.status, "complete");
  assert.strictEqual(result.trackCount, 3);
  assert.strictEqual(result.readyCount, 3);
  assert.strictEqual(result.failedCount, 0);
  result.tracks.forEach((track) => {
    assert.strictEqual(track.status, "ready");
    assert.ok(track.outputId, "each ready track has a durable polished asset id");
    assert.ok(track.outputName.endsWith("-studio-polished.wav"), "output reflects the chosen preset");
    assert.strictEqual(track.settings.noiseCleanup, "strong");
    assert.ok(track.treatment.includes("noise") && track.treatment.includes("presence"), "ready track describes the applied treatment");
  });
});

test("settingsSignature changes when settings change, so a saved polish goes stale", () => {
  const episode = setup.summarize(completeUploadDraft());
  const clean = audio.applyPreset(audio.createPolish(episode), "clean");
  const studio = audio.applyPreset(clean, "studio");
  const result = audio.processTracks(clean, episode);

  // The result matches the settings it was produced from...
  assert.strictEqual(audio.settingsSignature(result), audio.settingsSignature(clean));
  // ...but not a different preset, so the UI can detect a stale polish.
  assert.notStrictEqual(audio.settingsSignature(result), audio.settingsSignature(studio));
});

test("processTracks fails the step when a track has no imported source", () => {
  const episode = setup.summarize(uploadDraftWithMissingSource());
  const result = audio.processTracks(audio.createPolish(episode), episode);

  assert.strictEqual(result.status, "failed");
  assert.strictEqual(result.readyCount, 1);
  assert.strictEqual(result.failedCount, 1);
  const failed = result.tracks.find((track) => track.status === "failed");
  assert.ok(failed && failed.reason, "failed track explains why it could not be polished");
  assert.strictEqual(failed.outputId, "");
});

test("processTracks is deterministic so reloaded episodes keep their polished assets", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.applyPreset(audio.createPolish(episode), "clean");
  const first = audio.processTracks(polish, episode);
  const second = audio.processTracks(polish, episode);
  assert.deepStrictEqual(
    first.tracks.map((track) => track.outputId),
    second.tracks.map((track) => track.outputId),
  );
  // Different settings must produce different polished assets.
  const restyled = audio.processTracks(audio.applyPreset(polish, "studio"), episode);
  assert.notStrictEqual(first.tracks[0].outputId, restyled.tracks[0].outputId);
});

test("summarizePolishResult exposes polished track references and stays JSON-durable", () => {
  const episode = setup.summarize(completeUploadDraft());
  const result = audio.processTracks(audio.createPolish(episode), episode);
  const summary = audio.summarizePolishResult(result);

  assert.strictEqual(summary.status, "complete");
  assert.strictEqual(summary.complete, true);
  assert.strictEqual(summary.polishedTrackCount, 3);
  assert.strictEqual(summary.failedTrackCount, 0);
  assert.ok(summary.presetName, "keeps presetName for existing review/export consumers");
  assert.ok(summary.treatmentLine, "keeps treatmentLine for existing review/export consumers");
  assert.strictEqual(summary.outputs.length, 3);

  // Surviving a localStorage round-trip preserves the polished track references.
  const restored = JSON.parse(JSON.stringify(summary));
  assert.deepStrictEqual(restored.outputs, summary.outputs);
});

test("buildReviewSummary blocks export until polish actually completes", () => {
  const episode = setup.summarize(uploadDraftWithMissingSource());
  const failed = audio.summarizePolishResult(audio.processTracks(audio.createPolish(episode), episode));
  const blockedReview = audio.buildReviewSummary(episode, failed, {});
  assert.strictEqual(blockedReview.readyForExport, false, "a failed polish run is not export-ready");

  const ok = audio.summarizePolishResult(
    audio.processTracks(audio.createPolish(setup.summarize(completeUploadDraft())), setup.summarize(completeUploadDraft())),
  );
  const readyReview = audio.buildReviewSummary(setup.summarize(completeUploadDraft()), ok, {});
  assert.strictEqual(readyReview.readyForExport, true);
  assert.strictEqual(readyReview.polishedTrackCount, 3);
  assert.ok(readyReview.summaryLines.some((line) => line.indexOf("Audio:") === 0 && line.includes("polished")));
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

console.log(`\naudio polish: ${passed} assertions passed`);

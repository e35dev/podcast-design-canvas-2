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

test("tracks start pending and are not yet applied (#197)", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.createPolish(episode);
  assert.strictEqual(polish.applied, false);
  assert.ok(polish.speakers.every((t) => t.status === audio.TRACK_STATUS.PENDING));
  assert.ok(polish.speakers.every((t) => t.asset === null));
  assert.strictEqual(audio.isApplied(polish), false);
});

test("applyPolish processes every imported track into a durable polished asset (#197)", () => {
  const episode = setup.summarize(completeUploadDraft());
  let polish = audio.applyPreset(audio.createPolish(episode), "studio");
  polish = audio.applyPolish(polish);

  assert.strictEqual(polish.applied, true);
  assert.ok(polish.appliedAt, "records when it was applied");
  assert.strictEqual(polish.speakers.length, 3);
  polish.speakers.forEach((track) => {
    assert.strictEqual(track.status, audio.TRACK_STATUS.COMPLETED);
    assert.ok(track.asset, "each track has a polished asset");
    assert.ok(/polished\.wav$/.test(track.asset.polishedName));
    assert.strictEqual(track.asset.settings.preset, "studio");
  });
  assert.strictEqual(audio.isApplied(polish), true);
  assert.strictEqual(audio.polishedAssets(polish).length, 3);
});

test("polished asset names are unique per speaker track", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.applyPolish(audio.createPolish(episode));
  const names = polish.speakers.map((t) => t.asset.polishedName);
  assert.strictEqual(new Set(names).size, names.length, "no two tracks share a polished asset name");
});

test("summarizePolish reports processed state and per-track polished references", () => {
  const episode = setup.summarize(completeUploadDraft());
  const before = audio.summarizePolish(audio.createPolish(episode));
  assert.strictEqual(before.processed, false);
  assert.strictEqual(before.usesPolishedAudio, false);

  const after = audio.summarizePolish(audio.applyPolish(audio.createPolish(episode)));
  assert.strictEqual(after.processed, true);
  assert.strictEqual(after.usesPolishedAudio, true);
  assert.strictEqual(after.polishedTrackCount, 3);
  assert.ok(after.tracks.every((t) => t.status === "completed" && t.polishedName));
});

test("a completed polish survives a serialize/restore round trip (reload persistence)", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.applyPolish(audio.createPolish(episode));
  const restored = JSON.parse(JSON.stringify(polish));
  assert.strictEqual(audio.isApplied(restored), true);
  assert.strictEqual(audio.polishedAssets(restored).length, 3);
  assert.deepStrictEqual(
    audio.summarizePolish(restored).tracks.map((t) => t.polishedName),
    polish.speakers.map((t) => t.asset.polishedName),
  );
});

test("review/export consume the polished tracks once applied", () => {
  const episode = setup.summarize(completeUploadDraft());
  const applied = audio.summarizePolish(audio.applyPolish(audio.createPolish(episode)));
  const review = audio.buildReviewSummary(episode, applied, { styleName: "Studio Spotlight" });
  assert.strictEqual(review.usesPolishedAudio, true);
  assert.strictEqual(review.polishedTrackCount, 3);
  assert.ok(review.summaryLines.some((line) => /Polished audio: 3 tracks/.test(line)));
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

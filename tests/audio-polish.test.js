"use strict";

// Audio polish smoke suite for Podcast Design Canvas (#15).
// Guards quality presets, per-speaker tracks, control adjustments, processing handoff, and review summary.
// Run with: `node tests/audio-polish.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");
const episodeExport = require("../app/episode-export.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");

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
  assert.strictEqual(polish.speakers[0].status, audio.PROCESSING_STATUS.PENDING);
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

test("summarizePolish stays incomplete until tracks are processed", () => {
  const episode = setup.summarize(completeUploadDraft());
  const summary = audio.summarizePolish(audio.createPolish(episode));
  assert.strictEqual(summary.presetName, "Clean");
  assert.strictEqual(summary.allTracksReady, false);
  assert.strictEqual(summary.exportReady, false);
});

test("runProcessing saves polished outputs for every imported speaker track", () => {
  const episode = setup.summarize(completeUploadDraft());
  const result = audio.runProcessing(audio.applyPreset(audio.createPolish(episode), "natural"), episode, {
    showId: "show-1",
    episodeId: "ep-1",
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.assets.length, 3);
  assert.strictEqual(result.polish.processingStatus, "complete");
  assert.strictEqual(result.polish.speakers.every((track) => track.status === audio.PROCESSING_STATUS.READY), true);
  assert.ok(result.polish.speakers[0].polishedFileName.includes("sam-natural-polished.wav"));
  const applied = audio.summarizePolish(result.polish);
  assert.strictEqual(applied.allTracksReady, true);
  assert.strictEqual(applied.polishedTrackCount, 3);
  assert.ok(applied.polishedTrackLine.includes("sam-natural-polished.wav"));
});

test("validatePolishForExport blocks export until polished tracks are saved", () => {
  const episode = setup.summarize(completeUploadDraft());
  const incomplete = audio.summarizePolish(audio.createPolish(episode));
  assert.strictEqual(audio.validatePolishForExport(incomplete).ok, false);
  const complete = audio.prepareProcessedPolish(episode, { showId: "show-1", episodeId: "ep-1" });
  assert.strictEqual(audio.validatePolishForExport(complete).ok, true);
  assert.strictEqual(episodeExport.validateReadiness({ audioPolish: complete, appliedStyle: { presetName: "Studio Spotlight" } }).ok, true);
});

test("serializePolishedAssets round-trips durable polished track references", () => {
  const episode = setup.summarize(completeUploadDraft());
  const result = audio.runProcessing(audio.createPolish(episode), episode, {
    showId: "show-1",
    episodeId: "ep-1",
  });
  const json = audio.serializePolishedAssets(result.assets);
  const restored = audio.deserializePolishedAssets(json);
  assert.strictEqual(restored.assets.length, 3);
  assert.strictEqual(restored.assets[0].rawSourceLabel, "sam.mp4");
  assert.ok(restored.assets[0].polishedFileName.includes("polished.wav"));
});

test("attachStoredAssets restores processed tracks after reload", () => {
  const episode = setup.summarize(completeUploadDraft());
  const processed = audio.runProcessing(audio.applyPreset(audio.createPolish(episode), "studio"), episode, {
    showId: "show-1",
    episodeId: "ep-1",
  });
  const stored = audio.deserializePolishedAssets(audio.serializePolishedAssets(processed.assets));
  const applied = audio.summarizePolish(processed.polish);
  const restored = audio.attachStoredAssets(audio.createPolish(episode), stored, applied);
  assert.strictEqual(restored.speakers.every((track) => track.status === audio.PROCESSING_STATUS.READY), true);
  assert.strictEqual(restored.speakers[0].polishedFileName, processed.polish.speakers[0].polishedFileName);
});

test("buildReviewSummary includes audio in the export path", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.prepareProcessedPolish(episode, { showId: "show-1", episodeId: "ep-1" });
  const review = audio.buildReviewSummary(episode, polish, {
    styleName: "Studio Spotlight",
    templateName: "Founders Unfiltered",
  });
  assert.strictEqual(review.episodeName, "Founders Unfiltered #7");
  assert.strictEqual(review.audioPreset, "Clean");
  assert.strictEqual(review.styleName, "Studio Spotlight");
  assert.strictEqual(review.readyForExport, true);
  assert.ok(review.summaryLines.some((line) => line.indexOf("Audio:") === 0));
  assert.ok(review.summaryLines.some((line) => /polished\.wav/.test(line)));
});

test("audio polish UI runs processing before continuing", () => {
  const block = ui.slice(ui.indexOf("function renderAudioPolish"), ui.indexOf("// ---- Visual moments editor"));
  assert.ok(block.includes("AP.runProcessing"));
  assert.ok(block.includes("persistPolishedAssets"));
  assert.ok(block.includes("audio-track-status"));
  assert.ok(!/appliedAudioPolish = AP\.summarizePolish\(audioPolish\);\s+if \(STY && !appliedStyle\)/.test(block));
});

test("ACCEPTANCE: episode setup flows into audio polish processing and saves export-ready outputs", () => {
  const draft = completeUploadDraft();
  assert.strictEqual(setup.validateDraft(draft).ok, true);

  const episode = setup.summarize(draft);
  let polish = audio.createPolish(episode);
  assert.strictEqual(polish.speakers.length, episode.speakerCount);

  polish = audio.applyPreset(polish, "clean");
  polish = audio.updateControl(polish, "speechClarity", "strong");
  const result = audio.runProcessing(polish, episode, { showId: "show-1", episodeId: "ep-1" });
  assert.strictEqual(result.ok, true);
  const applied = audio.summarizePolish(result.polish);
  assert.strictEqual(applied.presetName, "Clean");
  assert.strictEqual(applied.speechClarityLabel, "Strong");
  assert.strictEqual(applied.allTracksReady, true);

  const review = audio.buildReviewSummary(episode, applied, {});
  assert.strictEqual(review.readyForExport, true);
  assert.ok(review.audioTreatment.includes("Speech clarity: Strong"));
  assert.ok(review.polishedTrackLine.includes("polished.wav"));
});

console.log(`\naudio polish: ${passed} assertions passed`);

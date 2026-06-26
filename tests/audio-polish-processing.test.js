"use strict";

// Real audio polish processing handoff (#197).
// Run with: `node tests/audio-polish-processing.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");
const processor = require("../app/audio-processor.js");
const mediaStore = require("../app/audio-media-store.js");
const episodeExport = require("../app/episode-export.js");
const style = require("../app/episode-style.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");

function completeUploadDraft() {
  const draft = setup.createDraft();
  draft.episodeName = "Indie Makers Weekly — Episode 3";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Jordan Lee", fileName: "jordan.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Priya Shah", fileName: "priya.mp4" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Chris Ortiz", fileName: "chris.mp4" }),
  ];
  return draft;
}

test("transformSamples measurably changes imported audio samples", () => {
  const source = processor.synthesizeSourceSamples("jordan.mp4", 0.25);
  const processed = processor.processSourceSamples(source.samples, source.sampleRate, {
    noiseCleanup: "balanced",
    leveling: "balanced",
    speechClarity: "strong",
    enhancement: "strong",
  });
  assert.strictEqual(processor.samplesChanged(source.samples, processed.samples), true);
  assert.ok(processed.byteLength > 44);
  assert.ok(processed.wavBytes[0] === 0x52 && processed.wavBytes[1] === 0x49);
});

test("runProcessing saves polished WAV outputs for every imported speaker track", () => {
  mediaStore.__resetMemoryStoreForTests();
  const episode = setup.summarize(completeUploadDraft());
  const result = audio.runProcessing(audio.applyPreset(audio.createPolish(episode), "studio"), episode, {
    showId: "show-indie",
    episodeId: "ep-3",
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.assets.length, 3);
  assert.strictEqual(result.polish.speakers.every((track) => track.status === audio.PROCESSING_STATUS.READY), true);
  assert.ok(result.polish.speakers.every((track) => track.byteLength > 44));
  assert.ok(result.polish.speakers[0].polishedFileName.includes("jordan-studio-polished.wav"));
});

test("saveAssetsSync persists polished WAV bytes for reload", () => {
  mediaStore.__resetMemoryStoreForTests();
  const episode = setup.summarize(completeUploadDraft());
  const result = audio.runProcessing(audio.createPolish(episode), episode, {
    showId: "show-indie",
    episodeId: "ep-3",
  });
  mediaStore.saveAssetsSync("show-indie", "ep-3", result.assets);
  const restored = mediaStore.listAssetsSync("show-indie", "ep-3");
  assert.strictEqual(restored.length, 3);
  assert.ok(restored.every((asset) => asset.byteLength > 44));
  assert.ok(restored.every((asset) => /polished\.wav$/.test(asset.polishedFileName)));
});

test("attachStoredAssets restores processed track references from saved asset metadata", () => {
  mediaStore.__resetMemoryStoreForTests();
  const episode = setup.summarize(completeUploadDraft());
  const result = audio.runProcessing(audio.createPolish(episode), episode, {
    showId: "show-indie",
    episodeId: "ep-3",
  });
  assert.strictEqual(result.ok, true);
  const assets = result.assets.map((asset) => Object.assign({}, asset));
  const restored = audio.attachStoredAssets(audio.createPolish(episode), assets);
  const summary = audio.summarizePolish(restored);
  assert.strictEqual(summary.allTracksReady, true);
  assert.ok(summary.polishedTrackLine.includes("jordan-clean-polished.wav"));
});

test("validatePolishForExport blocks export until polished tracks are saved", () => {
  const episode = setup.summarize(completeUploadDraft());
  const incomplete = audio.summarizePolish(audio.createPolish(episode));
  assert.strictEqual(audio.validatePolishForExport(incomplete).ok, false);
  const complete = audio.prepareProcessedPolish(episode, { showId: "show-indie", episodeId: "ep-3" });
  assert.strictEqual(audio.validatePolishForExport(complete).ok, true);
  assert.strictEqual(episodeExport.validateReadiness({
    audioPolish: complete,
    appliedStyle: style.summarizeStyle(style.createSelection(), episode.speakerCount),
  }).ok, true);
});

test("buildExportAudioLine references saved polished track filenames", () => {
  const episode = setup.summarize(completeUploadDraft());
  const applied = audio.summarizePolish(audio.runProcessing(
    audio.applyPreset(audio.createPolish(episode), "studio"),
    episode,
    { showId: "show-indie", episodeId: "ep-3" },
  ).polish);
  const line = audio.buildExportAudioLine(applied);
  assert.ok(/Audio: Studio/.test(line));
  assert.ok(/polished\.wav/.test(line));
  const exportSummary = episodeExport.buildFinalSummary(episode, {
    audioPolish: applied,
    appliedStyle: style.summarizeStyle(style.createSelection(), episode.speakerCount),
  }, episodeExport.createExport(episode));
  assert.ok(exportSummary.lines.some((entry) => /polished\.wav/.test(entry)));
});

test("audio polish UI runs real processing handoff before continuing", () => {
  assert.ok(ui.includes("function applyAudioPolishHandoff"));
  assert.ok(ui.includes("function restoreAudioPolishFromStorage"));
  assert.ok(ui.includes("runProcessingAndPersist"));
  const block = ui.slice(ui.indexOf("function renderAudioPolish"), ui.indexOf("// ---- Visual moments editor"));
  assert.ok(block.includes("audio-track-status"));
  assert.ok(block.includes("applyAudioPolishHandoff(summary)"));
  assert.ok(!/appliedAudioPolish = AP\.summarizePolish\(audioPolish\);\s+if \(STY && !appliedStyle\)/.test(block));
});

test("ACCEPTANCE: imported upload episode can process, persist, reload, and export polished tracks", () => {
  mediaStore.__resetMemoryStoreForTests();
  const draft = completeUploadDraft();
  assert.strictEqual(setup.validateDraft(draft).ok, true);
  const episode = setup.summarize(draft);
  let polish = audio.applyPreset(audio.createPolish(episode), "clean");
  polish = audio.updateControl(polish, "speechClarity", "strong");
  const result = audio.runProcessing(polish, episode, { showId: "show-indie", episodeId: "ep-3" });
  assert.strictEqual(result.ok, true);
  const applied = audio.summarizePolish(result.polish);
  assert.strictEqual(applied.allTracksReady, true);
  assert.strictEqual(applied.speechClarityLabel, "Strong");
  assert.ok(applied.polishedTrackLine.includes("jordan-clean-polished.wav"));
  const review = audio.buildReviewSummary(episode, applied, {});
  assert.strictEqual(review.readyForExport, true);
  assert.ok(review.polishedTrackLine.includes("polished.wav"));
});

console.log(`\naudio polish processing: ${passed} assertions passed`);

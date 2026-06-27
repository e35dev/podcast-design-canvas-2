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
const importedSources = require("../app/imported-track-sources.js");
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
  draft.episodeName = "Indie Makers Weekly - Episode 3";
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

function registerEpisodeSources(episode, context) {
  importedSources.__resetMemoryStoreForTests();
  return audio.registerImportedSources(
    episode,
    context,
    audio.buildImportedSourceEntriesFromProcessor(episode),
  );
}

test("runProcessing saves polished WAV outputs for every imported speaker track", () => {
  mediaStore.__resetMemoryStoreForTests();
  const episode = setup.summarize(completeUploadDraft());
  const context = { showId: "show-indie", episodeId: "ep-3" };
  registerEpisodeSources(episode, context);
  const result = audio.runProcessing(audio.applyPreset(audio.createPolish(episode), "studio"), episode, context);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.assets.length, 3);
  assert.strictEqual(result.polish.speakers.every((track) => track.status === audio.PROCESSING_STATUS.READY), true);
  assert.ok(result.polish.speakers.every((track) => track.byteLength > 44));
  assert.ok(result.polish.speakers[0].polishedFileName.includes("jordan-studio-polished.wav"));
});

test("saveAssetsSync persists polished WAV bytes for reload", () => {
  mediaStore.__resetMemoryStoreForTests();
  const episode = setup.summarize(completeUploadDraft());
  const context = { showId: "show-indie", episodeId: "ep-3" };
  registerEpisodeSources(episode, context);
  const result = audio.runProcessing(audio.createPolish(episode), episode, context);
  mediaStore.saveAssetsSync("show-indie", "ep-3", result.assets);
  const restored = mediaStore.listAssetsSync("show-indie", "ep-3");
  assert.strictEqual(restored.length, 3);
  assert.ok(restored.every((asset) => asset.byteLength > 44));
  assert.ok(restored.every((asset) => /polished\.wav$/.test(asset.polishedFileName)));
});

test("saveAsset merge keeps every polished track after sequential saves", () => {
  mediaStore.__resetMemoryStoreForTests();
  const episode = setup.summarize(completeUploadDraft());
  const context = { showId: "show-indie", episodeId: "ep-3" };
  registerEpisodeSources(episode, context);
  const result = audio.runProcessing(audio.createPolish(episode), episode, context);
  assert.strictEqual(result.ok, true);
  result.assets.forEach((asset) => {
    mediaStore.saveAsset(Object.assign({}, asset));
  });
  const restored = mediaStore.listAssetsSync("show-indie", "ep-3");
  assert.strictEqual(restored.length, 3);
  assert.ok(restored.every((asset) => asset.byteLength > 44));
});

test("saveAsset merge keeps every polished track in localStorage after reload", () => {
  const memory = {};
  global.localStorage = {
    getItem(key) {
      return memory[key] || null;
    },
    setItem(key, value) {
      memory[key] = value;
    },
    removeItem(key) {
      delete memory[key];
    },
  };
  mediaStore.__resetMemoryStoreForTests();
  const episode = setup.summarize(completeUploadDraft());
  const context = { showId: "show-indie", episodeId: "ep-3" };
  registerEpisodeSources(episode, context);
  const result = audio.runProcessing(audio.createPolish(episode), episode, context);
  assert.strictEqual(result.ok, true);
  result.assets.forEach((asset) => {
    mediaStore.saveAsset(Object.assign({}, asset));
  });
  mediaStore.__resetMemoryStoreForTests();
  const restored = mediaStore.listAssetsSync("show-indie", "ep-3");
  assert.strictEqual(restored.length, 3);
  assert.ok(restored.every((asset) => asset.byteLength > 44));
  delete global.localStorage;
});

test("imported sources persist across reload for every speaker track", () => {
  const memory = {};
  global.localStorage = {
    getItem(key) { return memory[key] || null; },
    setItem(key, value) { memory[key] = value; },
    removeItem(key) { delete memory[key]; },
  };
  importedSources.__resetMemoryStoreForTests();
  const episode = setup.summarize(completeUploadDraft());
  const context = { showId: "show-indie", episodeId: "ep-3" };
  registerEpisodeSources(episode, context);
  importedSources.__resetMemoryStoreForTests();
  const restored = importedSources.loadEpisodeSources("show-indie", "ep-3");
  assert.strictEqual(restored.entries.length, 3);
  assert.ok(restored.entries.every((entry) => entry.sampleLength > 0));
  delete global.localStorage;
});

test("attachStoredAssets restores processed track references from saved asset metadata", () => {
  mediaStore.__resetMemoryStoreForTests();
  const episode = setup.summarize(completeUploadDraft());
  const context = { showId: "show-indie", episodeId: "ep-3" };
  registerEpisodeSources(episode, context);
  const result = audio.runProcessing(audio.createPolish(episode), episode, context);
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
  const context = { showId: "show-indie", episodeId: "ep-3" };
  registerEpisodeSources(episode, context);
  const applied = audio.summarizePolish(audio.runProcessing(
    audio.applyPreset(audio.createPolish(episode), "studio"),
    episode,
    context,
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

test("syncTracksWithImportedSources marks pending tracks as source-ready before apply", () => {
  importedSources.__resetMemoryStoreForTests();
  const episode = setup.summarize(completeUploadDraft());
  registerEpisodeSources(episode, { showId: "show-indie", episodeId: "ep-3" });
  let polish = audio.createPolish(episode);
  polish = audio.syncTracksWithImportedSources(polish, episode, { showId: "show-indie", episodeId: "ep-3" });
  assert.strictEqual(polish.speakers.every((track) => track.status === "pending"), true);
  assert.strictEqual(polish.speakers.every((track) => track.sourceReady), true);
  assert.strictEqual(polish.speakers.every((track) => !track.error), true);
});

test("clearStaleProcessingFailures resets failed tracks to pending before apply", () => {
  const episode = setup.summarize(completeUploadDraft());
  let polish = audio.createPolish(episode);
  polish.speakers[0].status = "failed";
  polish.speakers[0].error = "Imported source audio is missing for this speaker track. Complete episode setup first.";
  polish = audio.clearStaleProcessingFailures(polish);
  assert.strictEqual(polish.speakers[0].status, "pending");
  assert.strictEqual(polish.speakers[0].error, "");
});

test("audio polish UI runs real processing handoff before continuing", () => {
  assert.ok(ui.includes("function applyAudioPolishHandoff"));
  assert.ok(ui.includes("function ensureImportedSourcesRegistered"));
  assert.ok(ui.includes("function prepareAudioPolishView"));
  assert.ok(ui.includes("function registerImportedSourcesForEpisode"));
  assert.ok(ui.includes("function restoreAudioPolishFromStorage"));
  assert.ok(ui.includes("runProcessingAndPersist"));
  const block = ui.slice(ui.indexOf("function renderAudioPolish"), ui.indexOf("// ---- Visual moments editor"));
  assert.ok(block.includes("audio-track-status"));
  assert.ok(block.includes("audio-apply-continue"));
  assert.ok(block.includes("Apply audio & continue →"));
  assert.ok(block.includes("Continue to workspace →"));
  assert.ok(block.includes("audio-polish-apply-bar"));
  assert.ok(!/appliedAudioPolish = AP\.summarizePolish\(audioPolish\);\s+if \(STY && !appliedStyle\)/.test(block));
});

test("ACCEPTANCE: imported upload episode can process, persist, reload, and export polished tracks", () => {
  mediaStore.__resetMemoryStoreForTests();
  const draft = completeUploadDraft();
  assert.strictEqual(setup.validateDraft(draft).ok, true);
  const episode = setup.summarize(draft);
  let polish = audio.applyPreset(audio.createPolish(episode), "clean");
  polish = audio.updateControl(polish, "speechClarity", "strong");
  registerEpisodeSources(episode, { showId: "show-indie", episodeId: "ep-3" });
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

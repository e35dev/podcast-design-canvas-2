"use strict";

// Audio polish real-processing suite for Podcast Design Canvas (#197).
// Proves the polish step turns the chosen treatment into durable, genuinely transformed
// polished audio for every imported speaker track, that the applied settings and polished
// track references survive a serialize/reload round trip, and that review/export consume
// those polished tracks rather than the raw source.
// Run with: `node tests/audio-polish-processing.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");
const engine = require("../app/audio-engine.js");
const exportApi = require("../app/episode-export.js");
const review = require("../app/publish-review.js");

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

function episodeAndPolish() {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.createPolish(episode);
  return { episode, polish };
}

test("processTracks saves a real polished WAV asset for every imported speaker track", () => {
  const { episode, polish } = episodeAndPolish();
  const processing = audio.processTracks(polish, episode);

  assert.strictEqual(processing.complete, true);
  assert.strictEqual(processing.tracks.length, 3);
  assert.strictEqual(processing.savedCount, 3);
  assert.strictEqual(processing.failedCount, 0);

  processing.tracks.forEach((track) => {
    assert.strictEqual(track.status, "saved");
    assert.ok(track.byteLength > 44, "real WAV bytes beyond the 44-byte header");
    assert.ok(track.fileName.endsWith("-polished.wav"));
    assert.ok(/^[0-9a-f]{8}$/.test(track.checksum), "stable checksum reference");
    assert.ok(typeof track.base64 === "string" && track.base64.length > 0, "durable saved bytes");
    assert.ok(track.durationSec > 0);
  });
  assert.ok(processing.totalBytes > 0);
});

test("processing genuinely transforms the audio, not a no-op filename", () => {
  const { episode, polish } = episodeAndPolish();
  const processing = audio.processTracks(polish, episode);

  processing.tracks.forEach((track) => {
    // The treatment changed the signal: output loudness differs from the input.
    assert.notStrictEqual(track.outputRms, track.inputRms);
    assert.ok(track.outputRms > 0);
    assert.ok(track.peak > 0 && track.peak <= 1, "output is real, peak-bounded audio");
  });

  // Decoding the saved bytes yields the same sample count we encoded.
  const first = processing.tracks[0];
  const decoded = engine.decodeWav(engine.base64ToBytes(first.base64));
  assert.strictEqual(decoded.sampleRate, processing.sampleRate);
  assert.strictEqual(decoded.samples.length, (first.byteLength - 44) / 2);
});

test("different quality choices produce different polished audio; the same choice is deterministic", () => {
  const { episode } = episodeAndPolish();

  const natural = audio.processTracks(audio.applyPreset(audio.createPolish(episode), "natural"), episode);
  const studio = audio.processTracks(audio.applyPreset(audio.createPolish(episode), "studio"), episode);
  const studioAgain = audio.processTracks(audio.applyPreset(audio.createPolish(episode), "studio"), episode);

  // Same track, different treatment => different saved bytes (the settings actually matter).
  assert.notStrictEqual(natural.tracks[0].checksum, studio.tracks[0].checksum);
  // Same treatment => identical, durable output across reloads.
  assert.strictEqual(studio.tracks[0].checksum, studioAgain.tracks[0].checksum);
});

test("processTracks reports failure (incomplete) when the engine cannot process a track", () => {
  const { episode, polish } = episodeAndPolish();
  // A broken engine stub forces processing to fail for every track.
  const processing = audio.processTracks(polish, episode, { engine: {} });

  assert.strictEqual(processing.complete, false);
  assert.strictEqual(processing.savedCount, 0);
  assert.strictEqual(processing.failedCount, 3);
  processing.tracks.forEach((track) => {
    assert.strictEqual(track.status, "failed");
    assert.ok(track.error, "a clear failure reason is reported");
  });

  // A failed run must not look "processed" downstream.
  const summary = audio.summarizePolish(polish, processing);
  assert.strictEqual(summary.processed, false);
  assert.strictEqual(summary.polishedTrackCount, 0);
});

test("summarizePolish records polished track references only after a complete run", () => {
  const { episode, polish } = episodeAndPolish();

  const before = audio.summarizePolish(polish);
  assert.strictEqual(before.processed, false);
  assert.strictEqual(before.polishedTrackCount, 0);

  const processing = audio.processTracks(polish, episode);
  const after = audio.summarizePolish(polish, processing);
  assert.strictEqual(after.processed, true);
  assert.strictEqual(after.polishedTrackCount, 3);
  assert.strictEqual(after.polishedTracks.length, 3);
  assert.ok(after.polishedSignature, "carries a settings signature for staleness checks");
  // The persisted summary stays lightweight: track references, not raw audio bytes.
  after.polishedTracks.forEach((track) => {
    assert.ok(track.checksum);
    assert.strictEqual(track.base64, undefined);
  });
});

test("applied settings and polished references survive a serialize/reload round trip", () => {
  const { episode } = episodeAndPolish();
  let polish = audio.applyPreset(audio.createPolish(episode), "studio");
  polish = audio.updateControl(polish, "noiseCleanup", "light");
  const processing = audio.processTracks(polish, episode);
  const applied = audio.summarizePolish(polish, processing);

  // Reload: persisted snapshots are plain JSON.
  const reloaded = JSON.parse(JSON.stringify(applied));
  assert.strictEqual(reloaded.processed, true);
  assert.strictEqual(reloaded.polishedTrackCount, 3);
  assert.strictEqual(reloaded.polishedSignature, applied.polishedSignature);

  // Reopening the polish step restores the exact preset and control levels.
  const restored = audio.restorePolish(reloaded, episode);
  assert.strictEqual(restored.presetId, "studio");
  assert.strictEqual(restored.noiseCleanup, "light");
  assert.strictEqual(restored.leveling, "strong");
  assert.strictEqual(audio.settingsSignature(restored), reloaded.polishedSignature);
});

test("review and export consume the polished tracks rather than raw audio", () => {
  const { episode, polish } = episodeAndPolish();
  const processing = audio.processTracks(polish, episode);
  const applied = audio.summarizePolish(polish, processing);

  const reviewSummary = audio.buildReviewSummary(episode, applied, {});
  assert.strictEqual(reviewSummary.polishedTrackCount, 3);
  assert.ok(reviewSummary.summaryLines.some((line) => /polished track/.test(line)));

  const exportLines = exportApi.buildFinalSummary(episode, { audioPolish: applied }, exportApi.createExport(episode)).lines;
  assert.ok(exportLines.some((line) => line.indexOf("Audio outputs:") === 0));
  assert.ok(exportLines.some((line) => /not raw source/.test(line)));

  const checks = review.runChecks(episode, { audioPolish: applied, appliedStyle: { presetName: "Studio Spotlight" } });
  const audioCheck = checks.find((item) => item.id === "audio-ready");
  assert.ok(audioCheck, "audio shows as ready");
  assert.ok(/polished track/.test(audioCheck.message));
});

test("ACCEPTANCE: choose a preset, apply, see polished outputs saved per track, reload, and export uses them", () => {
  const draft = completeUploadDraft();
  assert.strictEqual(setup.validateDraft(draft).ok, true);
  const episode = setup.summarize(draft);

  // Open polish, choose a quality preset, apply.
  let polish = audio.createPolish(episode);
  polish = audio.applyPreset(polish, "clean");
  const processing = audio.processTracks(polish, episode);

  // The step only completes once polished outputs are saved for each speaker track.
  assert.strictEqual(processing.complete, true);
  assert.strictEqual(processing.savedCount, episode.speakerCount);
  const applied = audio.summarizePolish(polish, processing);
  assert.strictEqual(applied.processed, true);

  // Reload preserves the applied settings and polished track references.
  const reloaded = JSON.parse(JSON.stringify(applied));
  const restored = audio.restorePolish(reloaded, episode);
  assert.strictEqual(restored.presetId, "clean");
  assert.strictEqual(reloaded.polishedTrackCount, episode.speakerCount);

  // Export/review uses those polished tracks.
  const exportLines = exportApi.buildFinalSummary(episode, { audioPolish: reloaded }, exportApi.createExport(episode)).lines;
  assert.ok(exportLines.some((line) => line.indexOf("Audio outputs:") === 0));
});

console.log(`\naudio polish processing: ${passed} assertions passed`);

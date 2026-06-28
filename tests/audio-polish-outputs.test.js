"use strict";

// Audio polish real-output suite for Podcast Design Canvas (#257).
// Proves that applying the creator-facing quality controls creates a concrete polished
// track for every assigned speaker (product data, derived from the preserved imported
// track), preserves the originals, marks polish complete, survives a serialize/reload
// round trip, and is consumed by review/export instead of the raw originals.
// Run with: `node tests/audio-polish-outputs.test.js`.

const assert = require("assert");
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

function uploadEpisode() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #9";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim" }),
  ];
  setup.attachSourceMediaAsset(draft.speakers[0], {
    assetId: "asset-host", fileName: "host.wav", fileSize: 20000, mimeType: "audio/wav", storage: "indexedDB",
  });
  setup.attachSourceMediaAsset(draft.speakers[1], {
    assetId: "asset-guest", fileName: "guest.wav", fileSize: 18000, mimeType: "audio/wav", storage: "indexedDB",
  });
  return { draft: draft, episode: setup.summarize(draft) };
}

test("applyPolish creates a polished track for every assigned speaker and marks complete", () => {
  const { episode } = uploadEpisode();
  const polish = audio.applyPreset(audio.createPolish(episode), "studio");
  const applied = audio.applyPolish(polish, episode);

  assert.strictEqual(applied.complete, true);
  assert.strictEqual(applied.tracks.length, episode.speakerCount);
  assert.strictEqual(applied.speakerCount, 2);
  applied.tracks.forEach((track) => {
    assert.strictEqual(track.status, "polished");
    assert.strictEqual(track.presetName, "Studio");
    assert.strictEqual(track.treatments.noiseCleanup, "strong");
    assert.ok(track.outputName.endsWith("-studio-polished"));
    assert.ok(track.outputId.indexOf("polished:") === 0);
  });
});

test("polished tracks preserve and reference the original imported media", () => {
  const { episode } = uploadEpisode();
  const applied = audio.applyPolish(audio.createPolish(episode), episode);

  const hostTrack = applied.tracks.find((t) => t.role === "Host");
  assert.strictEqual(hostTrack.fromRealMedia, true);
  assert.strictEqual(hostTrack.original.assetId, "asset-host");
  assert.ok(hostTrack.original.byteLength > 0);
  assert.strictEqual(hostTrack.original.fileName, "host.wav");
  assert.strictEqual(applied.realMediaCount, 2);

  // The original imported track on the episode is untouched (preserved, not overwritten).
  assert.strictEqual(episode.speakers[0].sourceMedia.assetId, "asset-host");
});

test("different quality choices produce different polished outputs; same choice is stable", () => {
  const { episode } = uploadEpisode();
  const studio = audio.applyPolish(audio.applyPreset(audio.createPolish(episode), "studio"), episode);
  const natural = audio.applyPolish(audio.applyPreset(audio.createPolish(episode), "natural"), episode);
  const studioAgain = audio.applyPolish(audio.applyPreset(audio.createPolish(episode), "studio"), episode);

  assert.notStrictEqual(studio.tracks[0].outputId, natural.tracks[0].outputId);
  assert.notStrictEqual(studio.tracks[0].treatments.enhancement, natural.tracks[0].treatments.enhancement);
  assert.strictEqual(studio.tracks[0].outputId, studioAgain.tracks[0].outputId);
});

test("summarizePolish records the polished outputs only after a complete apply", () => {
  const { episode } = uploadEpisode();
  const polish = audio.applyPreset(audio.createPolish(episode), "clean");

  const before = audio.summarizePolish(polish);
  assert.strictEqual(before.polished, false);
  assert.strictEqual(before.polishedTrackCount, 0);

  const applied = audio.applyPolish(polish, episode);
  const after = audio.summarizePolish(polish, applied);
  assert.strictEqual(after.polished, true);
  assert.strictEqual(after.polishedTrackCount, 2);
  assert.strictEqual(after.polishedTracks.length, 2);
  assert.strictEqual(after.polishedSignature, applied.signature);
});

test("applied settings and polished outputs survive a serialize/reload round trip", () => {
  const { episode } = uploadEpisode();
  let polish = audio.applyPreset(audio.createPolish(episode), "studio");
  polish = audio.updateControl(polish, "noiseCleanup", "light");
  const applied = audio.applyPolish(polish, episode);
  const summary = audio.summarizePolish(polish, applied);

  const reloaded = JSON.parse(JSON.stringify(summary));
  assert.strictEqual(reloaded.polished, true);
  assert.strictEqual(reloaded.polishedTrackCount, 2);
  assert.strictEqual(reloaded.polishedTracks[0].original.assetId, "asset-host");

  const restored = audio.restorePolish(reloaded, episode);
  assert.strictEqual(restored.presetId, "studio");
  assert.strictEqual(restored.noiseCleanup, "light");
  assert.strictEqual(restored.leveling, "strong");
  assert.strictEqual(audio.settingsSignature(restored), reloaded.polishedSignature);
});

test("review and export consume the polished tracks rather than the raw originals", () => {
  const { episode } = uploadEpisode();
  const polish = audio.createPolish(episode);
  const applied = audio.applyPolish(polish, episode);
  const summary = audio.summarizePolish(polish, applied);

  const reviewSummary = audio.buildReviewSummary(episode, summary, {});
  assert.strictEqual(reviewSummary.polishedTrackCount, 2);
  assert.ok(reviewSummary.summaryLines.some((line) => /polished track/.test(line)));

  const exportLines = exportApi.buildFinalSummary(episode, { audioPolish: summary }, exportApi.createExport(episode)).lines;
  assert.ok(exportLines.some((line) => line.indexOf("Audio outputs:") === 0));
  assert.ok(exportLines.some((line) => /not the raw originals/.test(line)));

  const checks = review.runChecks(episode, { audioPolish: summary, appliedStyle: { presetName: "Studio Spotlight" } });
  const audioCheck = checks.find((item) => item.id === "audio-ready");
  assert.ok(audioCheck && /polished track/.test(audioCheck.message));
});

test("Riverside-linked tracks are polished too (no real media, still per-speaker outputs)", () => {
  const draft = setup.createDraft();
  draft.episodeName = "Riverside Live";
  draft.sourceMode = "riverside";
  draft.riversideLink = setup.sandboxDemoRiversideLink();
  const discovery = setup.discoverRiversideTracks(draft.riversideLink);
  const applied = setup.applyDiscoveryToBuckets(draft, discovery);
  const episode = setup.summarize(applied);

  const result = audio.applyPolish(audio.createPolish(episode), episode);
  assert.strictEqual(result.complete, true);
  assert.strictEqual(result.tracks.length, episode.speakerCount);
  assert.strictEqual(result.realMediaCount, 0, "Riverside links carry no local bytes");
  assert.strictEqual(result.tracks[0].original.sourceLabel, discovery.tracks[0].speakerLabel);
});

test("apply is incomplete when there are no assigned speakers", () => {
  const result = audio.applyPolish(audio.createPolish({ speakers: [] }), { speakers: [] });
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.tracks.length, 0);
  const summary = audio.summarizePolish(audio.createPolish({ speakers: [] }), result);
  assert.strictEqual(summary.polished, false);
});

test("ACCEPTANCE: apply creates polished tracks for every speaker, persists, and export uses them", () => {
  const { draft, episode } = uploadEpisode();
  assert.strictEqual(setup.validateDraft(draft).ok, true);

  // Open audio polish, choose quality, apply.
  let polish = audio.createPolish(episode);
  polish = audio.applyPreset(polish, "clean");
  const applied = audio.applyPolish(polish, episode);

  // Visible polished tracks for every assigned speaker; marks complete.
  assert.strictEqual(applied.complete, true);
  assert.strictEqual(applied.tracks.length, episode.speakerCount);
  const summary = audio.summarizePolish(polish, applied);
  assert.strictEqual(summary.polished, true);

  // Persists when leaving and returning.
  const reloaded = JSON.parse(JSON.stringify(summary));
  const restored = audio.restorePolish(reloaded, episode);
  assert.strictEqual(restored.presetId, "clean");
  assert.strictEqual(reloaded.polishedTrackCount, episode.speakerCount);

  // Export uses the polished tracks rather than the raw originals.
  const exportLines = exportApi.buildFinalSummary(episode, { audioPolish: reloaded }, exportApi.createExport(episode)).lines;
  assert.ok(exportLines.some((line) => line.indexOf("Audio outputs:") === 0));
});

console.log(`\naudio polish outputs: ${passed} assertions passed`);

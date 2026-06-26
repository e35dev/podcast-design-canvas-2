"use strict";

// Real audio processing suite for Podcast Design Canvas (#197).
// Proves Apply turns imported speaker tracks into durable, decodable polished
// WAV assets — not metadata — and that the export/review gate depends on them.
// Run with: `node tests/audio-polish-processing.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");
const exportApi = require("../app/episode-export.js");

let passed = 0;
const queue = [];
function test(name, fn) {
  queue.push([name, fn]);
}

function uploadEpisode() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Alex Chen", fileName: "alex.mp4" }),
  ];
  return setup.summarize(draft);
}

test("encodeWav/decodeWav is a real lossless-enough RIFF round trip", () => {
  const samples = new Float32Array(2000);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.sin((i / 2000) * Math.PI * 8) * 0.7;
  }
  const bytes = audio.encodeWav(samples, 8000);
  assert.ok(bytes.length > 44, "produces a non-empty WAV with header + data");
  const decoded = audio.decodeWav(bytes);
  assert.strictEqual(decoded.sampleRate, 8000);
  assert.strictEqual(decoded.samples.length, samples.length);
  let maxErr = 0;
  for (let i = 0; i < samples.length; i += 1) {
    maxErr = Math.max(maxErr, Math.abs(samples[i] - decoded.samples[i]));
  }
  assert.ok(maxErr < 0.01, `16-bit round trip stays accurate (max err ${maxErr})`);
});

test("processing produces a real, decodable, distinct WAV asset per speaker", () => {
  const episode = uploadEpisode();
  const polish = audio.applyPreset(audio.createPolish(episode), "studio");
  assert.strictEqual(audio.hasCompletePolishedTracks(polish), false);

  const processed = audio.processPolish(polish);
  assert.strictEqual(processed.processingStatus, "complete");
  assert.strictEqual(processed.speakers.length, 3);

  const assets = new Set();
  processed.speakers.forEach((track) => {
    assert.strictEqual(track.status, "complete");
    assert.ok(track.processedAsset.indexOf("data:audio/wav;base64,") === 0, "saved as a WAV data URI");
    assert.ok(track.byteLength > 44, "asset has real audio payload");
    const decoded = audio.decodeWav(audio.dataUriToBytes(track.processedAsset));
    assert.ok(decoded.samples.length > 0, "the saved asset decodes back to PCM");
    assets.add(track.processedAsset);
  });
  assert.strictEqual(assets.size, 3, "each speaker yields a genuinely different processed asset");
});

test("the processed audio actually differs from its source (a transform ran)", () => {
  const episode = uploadEpisode();
  const polish = audio.applyPreset(audio.createPolish(episode), "studio");
  const track = polish.speakers[0];
  const source = audio.decodeWav(audio.dataUriToBytes(audio.createPlaceholderSourceAsset(track)));
  const processed = audio.processPolish(polish).speakers[0];
  const out = audio.decodeWav(audio.dataUriToBytes(processed.processedAsset));
  let diff = 0;
  const n = Math.min(source.samples.length, out.samples.length);
  for (let i = 0; i < n; i += 1) {
    diff += Math.abs(source.samples[i] - out.samples[i]);
  }
  assert.ok(diff / n > 0.001, "polished samples are measurably transformed, not copied");
});

test("changing settings after Apply invalidates the saved tracks until re-applied", () => {
  const episode = uploadEpisode();
  const processed = audio.processPolish(audio.applyPreset(audio.createPolish(episode), "clean"));
  assert.strictEqual(audio.hasCompletePolishedTracks(processed), true);

  const retuned = audio.applyPreset(processed, "studio");
  assert.strictEqual(audio.hasCompletePolishedTracks(retuned), false, "stale assets are not treated as ready");

  const reprocessed = audio.processPolish(retuned);
  assert.strictEqual(audio.hasCompletePolishedTracks(reprocessed), true);
});

test("export readiness requires saved polished tracks, not just a chosen preset", () => {
  const episode = uploadEpisode();
  const style = { presetName: "Studio Spotlight", layoutLabel: "Side by side" };

  const presetOnly = audio.summarizePolish(audio.createPolish(episode));
  assert.strictEqual(presetOnly.polishedTrackCount, 0);
  assert.strictEqual(
    exportApi.validateReadiness({ audioPolish: presetOnly, appliedStyle: style }).ok,
    false,
    "a preset alone does not unlock export",
  );

  const polished = audio.summarizePolish(audio.processPolish(audio.createPolish(episode)));
  assert.strictEqual(polished.polishedTrackCount, 3);
  assert.ok(polished.assetLine.indexOf("polished WAV asset") >= 0);
  assert.strictEqual(
    exportApi.validateReadiness({ audioPolish: polished, appliedStyle: style }).ok,
    true,
    "saved polished tracks unlock export",
  );
});

test("ACCEPTANCE: apply audio polish persists real assets that survive a session round trip", async () => {
  const episode = uploadEpisode();
  let polish = audio.applyPreset(audio.createPolish(episode), "studio");

  // Apply (async path, as the UI uses).
  polish = await audio.processPolishAsync(polish, {});
  assert.strictEqual(audio.hasCompletePolishedTracks(polish), true);

  // Persist exactly how the workspace session is stored, then reload.
  const snapshot = JSON.parse(JSON.stringify({ audioPolish: polish }));
  const restored = snapshot.audioPolish;
  assert.strictEqual(audio.hasCompletePolishedTracks(restored), true, "polished tracks persist across reload");

  const applied = audio.summarizePolish(restored);
  assert.strictEqual(applied.polishedTrackCount, 3);
  assert.strictEqual(
    exportApi.validateReadiness({ audioPolish: applied, appliedStyle: { presetName: "X" } }).ok,
    true,
    "restored polished tracks still satisfy the export gate",
  );
});

(async () => {
  for (const [name, fn] of queue) {
    await fn();
    passed += 1;
    console.log(`  ok ${name}`);
  }
  console.log(`\naudio polish processing: ${passed} assertions passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

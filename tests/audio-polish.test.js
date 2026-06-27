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

// ---------------------------------------------------------------------------
// Real audio processing (#197)
// ---------------------------------------------------------------------------

function polishFor(presetId) {
  const episode = setup.summarize(completeUploadDraft());
  return audio.applyPreset(audio.createPolish(episode), presetId || "clean");
}

test("buildSampleSource yields a decodable 16-bit PCM WAV", () => {
  const src = audio.buildSampleSource(0);
  assert.ok(src.bytes.byteLength > 44, "has real audio payload");
  const decoded = audio.decodeWav(src.bytes);
  assert.ok(decoded.samples.length > 0, "decodes to samples");
  assert.strictEqual(decoded.sampleRate, 16000);
});

test("encodeWav/decodeWav round-trips samples and rate", () => {
  const samples = audio.decodeWav(audio.buildSampleSource(1).bytes).samples;
  const bytes = audio.encodeWav(samples, { sampleRate: 16000 });
  const back = audio.decodeWav(bytes);
  assert.strictEqual(back.samples.length, samples.length);
  assert.strictEqual(back.sampleRate, 16000);
});

test("applyPolishToSamples genuinely transforms the audio within range", () => {
  const samples = audio.decodeWav(audio.buildSampleSource(0).bytes).samples;
  const out = audio.applyPolishToSamples(samples, polishFor("studio"));
  assert.strictEqual(out.length, samples.length);
  let changed = 0;
  let inRange = true;
  for (let i = 0; i < out.length; i += 1) {
    if (Math.abs(out[i] - samples[i]) > 1e-4) changed += 1;
    if (out[i] < -1 || out[i] > 1) inRange = false;
  }
  assert.ok(changed > samples.length * 0.5, "most samples are actually processed");
  assert.ok(inRange, "polished samples stay within [-1, 1]");
});

test("processSource saves a named polished WAV that decodes back", () => {
  const polish = polishFor("clean");
  const src = audio.buildSampleSource(0);
  const asset = audio.processSource(src.bytes, polish, { trackIndex: 1, role: "Host", name: "Sam", sourceName: src.name });
  assert.strictEqual(asset.status, "saved");
  assert.strictEqual(asset.assetName, "host-clean.polished.wav");
  assert.ok(asset.byteLength > 44 && asset.durationMs > 0);
  const decoded = audio.decodeWav(audio.base64ToBytes(asset.dataBase64));
  assert.ok(decoded.samples.length > 0, "saved asset is a real WAV");
});

test("processEpisode polishes every track with a source into saved assets", () => {
  const polish = polishFor("studio");
  const sources = polish.speakers.map((_, i) => {
    const s = audio.buildSampleSource(i);
    return { name: s.name, bytes: s.bytes };
  });
  const result = audio.processEpisode(polish, sources);
  assert.strictEqual(result.savedCount, polish.speakers.length);
  assert.strictEqual(result.total, polish.speakers.length);
  assert.strictEqual(result.allComplete, true);
  assert.ok(result.totalBytes > 0);
  result.assets.forEach((asset) => assert.strictEqual(asset.status, "saved"));
});

test("processEpisode resolves a track with no source to needs-source, not fabricated audio", () => {
  const polish = polishFor("clean");
  const sources = polish.speakers.map((_, i) => (i === 0 ? { name: "a.wav", bytes: audio.buildSampleSource(0).bytes } : null));
  const result = audio.processEpisode(polish, sources);
  assert.strictEqual(result.allComplete, false);
  assert.strictEqual(result.assets[1].status, "needs-source");
  assert.strictEqual(result.assets[1].byteLength, 0);
});

test("summarizeProcessing reports saved assets for review/export", () => {
  const polish = polishFor("natural");
  const sources = polish.speakers.map((_, i) => ({ name: `t${i}.wav`, bytes: audio.buildSampleSource(i).bytes }));
  const view = audio.summarizeProcessing(audio.processEpisode(polish, sources));
  assert.strictEqual(view.savedCount, polish.speakers.length);
  assert.strictEqual(view.allComplete, true);
  assert.strictEqual(view.assetNames.length, polish.speakers.length);
  assert.ok(view.lines[0].includes(".polished.wav"));
});

test("buildReviewSummary marks export ready only once all tracks are polished", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = polishFor("clean");
  const incomplete = audio.processEpisode(polish, polish.speakers.map((_, i) => (i === 0 ? { name: "a.wav", bytes: audio.buildSampleSource(0).bytes } : null)));
  const appliedIncomplete = Object.assign(audio.summarizePolish(polish), { processing: incomplete });
  const reviewA = audio.buildReviewSummary(episode, appliedIncomplete, {});
  assert.strictEqual(reviewA.usesPolishedAudio, false);
  assert.strictEqual(reviewA.readyForExport, false);

  const complete = audio.processEpisode(polish, polish.speakers.map((_, i) => ({ name: `t${i}.wav`, bytes: audio.buildSampleSource(i).bytes })));
  const appliedComplete = Object.assign(audio.summarizePolish(polish), { processing: complete });
  const reviewB = audio.buildReviewSummary(episode, appliedComplete, {});
  assert.strictEqual(reviewB.usesPolishedAudio, true);
  assert.strictEqual(reviewB.readyForExport, true);
  assert.strictEqual(reviewB.polishedTrackCount, polish.speakers.length);
  assert.ok(reviewB.summaryLines.some((line) => line.indexOf("Polished audio:") === 0));
});

test("ACCEPTANCE: imported tracks become durable polished assets export consumes", () => {
  const draft = completeUploadDraft();
  const episode = setup.summarize(draft);
  const polish = audio.applyPreset(audio.createPolish(episode), "studio");

  // Imported speaker media (real WAV bytes) for each track.
  const sources = polish.speakers.map((_, i) => {
    const s = audio.buildSampleSource(i);
    return { name: s.name, bytes: s.bytes };
  });

  const result = audio.processEpisode(polish, sources);
  assert.strictEqual(result.allComplete, true);

  // Each saved asset is a real WAV derived from — and different to — the raw track.
  result.assets.forEach((asset, i) => {
    const raw = audio.decodeWav(sources[i].bytes).samples;
    const polished = audio.decodeWav(audio.base64ToBytes(asset.dataBase64)).samples;
    let changed = 0;
    for (let s = 0; s < Math.min(raw.length, polished.length); s += 1) {
      if (Math.abs(raw[s] - polished[s]) > 1e-4) changed += 1;
    }
    assert.ok(changed > 0, `${asset.role} polished audio differs from the raw import`);
  });

  // Export path reflects the saved polished tracks.
  const applied = Object.assign(audio.summarizePolish(polish), { processing: result });
  const review = audio.buildReviewSummary(episode, applied, {});
  assert.strictEqual(review.usesPolishedAudio, true);
  assert.strictEqual(review.polishedAssetNames.length, polish.speakers.length);
});

console.log(`\naudio polish: ${passed} assertions passed`);

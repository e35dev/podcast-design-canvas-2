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

// ---- Real per-track audio processing (#197) ---------------------------------

function bytesDiffer(a, b) {
  if (a.length !== b.length) {
    return true;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return true;
    }
  }
  return false;
}

const WAV_PREFIX = "data:audio/wav;base64,";

test("encodeWav/decodeWav round-trip a standards-compliant 16-bit mono WAV", () => {
  const samples = new Float32Array([0, 0.25, -0.5, 0.75, -1, 0.999]);
  const bytes = audio.encodeWav(samples, 8000);
  assert.strictEqual(bytes[0], "R".charCodeAt(0));
  assert.strictEqual(String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]), "WAVE");
  assert.strictEqual(bytes.length, 44 + samples.length * 2);

  const decoded = audio.decodeWav(bytes);
  assert.strictEqual(decoded.sampleRate, 8000);
  assert.strictEqual(decoded.bitsPerSample, 16);
  assert.strictEqual(decoded.numChannels, 1);
  assert.strictEqual(decoded.samples.length, samples.length);
  samples.forEach((value, index) => {
    assert.ok(Math.abs(decoded.samples[index] - value) < 1e-3, `sample ${index} survives the round trip`);
  });
  assert.throws(() => audio.decodeWav(new Uint8Array([1, 2, 3])), /RIFF\/WAVE/);
});

test("buildSourceWav produces a decodable ~1s source that is distinct per track", () => {
  const sourceA = audio.buildSourceWav({ role: "Host", name: "Sam Rivera", trackIndex: 1 });
  const sourceB = audio.buildSourceWav({ role: "Guest 1", name: "Dana Kim", trackIndex: 2 });
  const decodedA = audio.decodeWav(sourceA);
  assert.strictEqual(decodedA.sampleRate, 8000);
  assert.strictEqual(decodedA.samples.length, 8000);
  assert.ok(bytesDiffer(sourceA, sourceB), "distinct tracks yield distinct source audio");
});

test("processSamples transforms audio: output differs from input and varies by preset", () => {
  const episode = setup.summarize(completeUploadDraft());
  const source = audio.buildSourceWav({ role: "Host", name: "Sam Rivera", trackIndex: 1 });
  const decoded = audio.decodeWav(source);

  const studio = audio.applyPreset(audio.createPolish(episode), "studio");
  const natural = audio.applyPreset(audio.createPolish(episode), "natural");
  const studioOut = audio.encodeWav(audio.processSamples(decoded.samples, studio), decoded.sampleRate);
  const naturalOut = audio.encodeWav(audio.processSamples(decoded.samples, natural), decoded.sampleRate);

  assert.ok(bytesDiffer(source, studioOut), "processing changes the bytes");
  assert.ok(bytesDiffer(studioOut, naturalOut), "different presets produce different audio");
});

test("processPolish marks every track complete with a distinct polished WAV data URI", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.processPolish(audio.applyPreset(audio.createPolish(episode), "studio"));

  assert.strictEqual(polish.tracks.length, episode.speakerCount);
  polish.tracks.forEach((track) => {
    assert.strictEqual(track.status, "complete");
    assert.ok(track.processedAsset.indexOf(WAV_PREFIX) === 0, "asset is a wav data URI");
    assert.ok(track.processedAsset.length > WAV_PREFIX.length + 60, "asset is longer than a bare header");
    assert.doesNotThrow(() => audio.decodeWav(Buffer.from(track.processedAsset.slice(WAV_PREFIX.length), "base64")));
  });
  const uris = polish.tracks.map((track) => track.processedAsset);
  assert.strictEqual(new Set(uris).size, uris.length, "every track has a distinct polished asset");
});

test("hasCompletePolishedTracks validates count, status, asset, and settings hash", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polished = audio.summarizePolish(audio.processPolish(audio.createPolish(episode)));
  assert.strictEqual(audio.hasCompletePolishedTracks(polished), true);
  assert.strictEqual(polished.polishedTrackCount, episode.speakerCount);

  // Unprocessed polish is never ready.
  assert.strictEqual(
    audio.hasCompletePolishedTracks(audio.summarizePolish(audio.createPolish(episode))),
    false,
  );

  // Tampering with status, asset, count, or settings each invalidates readiness.
  const badStatus = JSON.parse(JSON.stringify(polished));
  badStatus.tracks[0].status = "processing";
  assert.strictEqual(audio.hasCompletePolishedTracks(badStatus), false);

  const badAsset = JSON.parse(JSON.stringify(polished));
  badAsset.tracks[1].processedAsset = "data:audio/wav;base64,QQ==";
  assert.strictEqual(audio.hasCompletePolishedTracks(badAsset), false);

  const droppedTrack = JSON.parse(JSON.stringify(polished));
  droppedTrack.tracks.pop();
  assert.strictEqual(audio.hasCompletePolishedTracks(droppedTrack), false);

  const settingsChanged = Object.assign({}, polished, {
    presetId: "natural",
    noiseCleanup: "light",
    leveling: "light",
    speechClarity: "light",
    enhancement: "light",
  });
  assert.strictEqual(audio.hasCompletePolishedTracks(settingsChanged), false);
});

console.log(`\naudio polish: ${passed} assertions passed`);

// Async per-track processing: status transitions and the failure path.
(async () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.applyPreset(audio.createPolish(episode), "studio");

  const transitions = [];
  const okRun = await audio.processPolishAsync(polish, {
    onTrack: (track, index, status) => transitions.push(`${track.trackIndex}:${status}`),
  });
  assert.strictEqual(okRun.ok, true);
  assert.strictEqual(okRun.polish.tracks.length, episode.speakerCount);
  assert.ok(okRun.polish.tracks.every((track) => track.status === "complete"));
  assert.ok(transitions.indexOf("1:processing") >= 0 && transitions.indexOf("1:complete") >= 0,
    "each track moves processing → complete");
  assert.ok(audio.hasCompletePolishedTracks(audio.summarizePolish(okRun.polish)));
  console.log("  ok processPolishAsync drives every track to complete");

  const failRun = await audio.processPolishAsync(polish, { failOn: (track, index) => index === 1 });
  assert.strictEqual(failRun.ok, false);
  assert.ok(failRun.failedTrack && failRun.failedTrack.status === "failed");
  assert.strictEqual(failRun.polish.tracks[0].status, "complete");
  assert.strictEqual(failRun.polish.tracks[1].status, "failed");
  assert.strictEqual(failRun.polish.tracks[2].status, "idle", "processing stops after a failure");
  assert.strictEqual(audio.hasCompletePolishedTracks(audio.summarizePolish(failRun.polish)), false);
  console.log("  ok processPolishAsync surfaces a failure and stays incomplete");

  console.log(`\naudio polish async: 2 assertions passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

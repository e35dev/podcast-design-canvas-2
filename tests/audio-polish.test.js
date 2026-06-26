"use strict";

// Audio polish smoke suite for Podcast Design Canvas (#15).
// Guards quality presets, per-speaker tracks, control adjustments, and review summary.
// Run with: `node tests/audio-polish.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");

let passed = 0;
const asyncTests = [];
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function testAsync(name, fn) {
  asyncTests.push({ name, fn });
}

function completeUploadDraft() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.wav" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.wav" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal", fileName: "marco.wav" }),
  ];
  draft.speakers.forEach((speaker, index) => {
    speaker.sourceAsset = sourceAsset(speaker.fileName, 220 + index * 110);
  });
  return draft;
}

function sourceWavBytes(frequency, durationSeconds = 1.2) {
  const sampleRate = 8000;
  const sampleCount = Math.round(sampleRate * durationSeconds);
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + sampleCount * 2, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    const envelope = 0.74 + 0.18 * Math.sin(2 * Math.PI * 2 * t);
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.42 * envelope;
    buffer.writeInt16LE(Math.max(-1, Math.min(1, sample)) * 0x7fff, 44 + index * 2);
  }
  return buffer;
}

function sourceAsset(fileName, frequency, durationSeconds) {
  const bytes = sourceWavBytes(frequency, durationSeconds);
  return setup.createSourceAsset(
    fileName,
    "audio/wav",
    `data:audio/wav;base64,${bytes.toString("base64")}`,
    bytes.length,
    "upload",
    { capturedByteLength: bytes.length, capturedAt: 1700000000000 },
  );
}

function processPolish(episode, polish) {
  return audio.processPolish(polish || audio.createPolish(episode), episode, { now: 1700000000000 });
}

function wavHeader(dataUri) {
  const bytes = Buffer.from(dataUri.split(",")[1], "base64");
  return {
    riff: bytes.toString("ascii", 0, 4),
    wave: bytes.toString("ascii", 8, 12),
    length: bytes.length,
  };
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
  assert.strictEqual(polish.speakers[0].sourceLabel, "sam.wav");
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
  assert.strictEqual(summary.readyForExport, false);
});

test("processPolish saves durable WAV assets for every speaker track", () => {
  const episode = setup.summarize(completeUploadDraft());
  const processed = processPolish(episode, audio.applyPreset(audio.createPolish(episode), "studio"));
  const summary = audio.summarizePolish(processed);

  assert.strictEqual(summary.processingStatus, "complete");
  assert.strictEqual(summary.readyForExport, true);
  assert.strictEqual(summary.completeTrackCount, 3);
  assert.strictEqual(summary.polishedTracks.length, 3);
  assert.strictEqual(audio.hasCompletePolishedTracks(summary), true);
  summary.polishedTracks.forEach((track) => {
    assert.strictEqual(track.status, "complete");
    assert.strictEqual(track.mimeType, "audio/wav");
    assert.ok(track.assetId.startsWith("polished-"));
    assert.ok(track.fileName.endsWith("-studio-polished.wav"));
    assert.ok(track.byteLength > 44);
    assert.strictEqual(track.sampleRate, 8000);
    assert.strictEqual(track.durationSeconds, 1.2);
    const header = wavHeader(track.dataUri);
    assert.strictEqual(header.riff, "RIFF");
    assert.strictEqual(header.wave, "WAVE");
    assert.strictEqual(header.length, track.byteLength);
  });
});

testAsync("processPolishAsync can process browser-decoded imported media", async () => {
  const previousAudioContext = global.AudioContext;
  const sourceBytes = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]);
  let decodeCalls = 0;
  let closed = false;

  class FakeAudioContext {
    decodeAudioData(arrayBuffer, resolve) {
      decodeCalls += 1;
      assert.strictEqual(arrayBuffer.byteLength, sourceBytes.length);
      const left = new Float32Array([0, 0.18, -0.25, 0.35, -0.12, 0.08]);
      const right = new Float32Array([0.02, 0.2, -0.2, 0.3, -0.1, 0.1]);
      const buffer = {
        length: left.length,
        numberOfChannels: 2,
        sampleRate: 44100,
        duration: left.length / 44100,
        getChannelData(channel) {
          return channel === 0 ? left : right;
        },
      };
      resolve(buffer);
      return Promise.resolve(buffer);
    }

    close() {
      closed = true;
      return Promise.resolve();
    }
  }

  global.AudioContext = FakeAudioContext;
  try {
    const episode = {
      episodeName: "Browser Media Weekly",
      sourceMode: "upload",
      speakers: [{
        role: "Host",
        name: "Avery",
        sourceLabel: "avery-host.mp4",
        sourceAsset: setup.createSourceAsset(
          "avery-host.mp4",
          "video/mp4",
          `data:video/mp4;base64,${sourceBytes.toString("base64")}`,
          sourceBytes.length,
          "upload",
          { capturedByteLength: sourceBytes.length, capturedAt: 1700000000000 },
        ),
      }],
    };
    const processed = await audio.processPolishAsync(
      audio.applyPreset(audio.createPolish(episode), "studio"),
      episode,
      { now: 1700000000000 },
    );
    const summary = audio.summarizePolish(processed);
    const [track] = summary.polishedTracks;

    assert.strictEqual(summary.readyForExport, true);
    assert.strictEqual(track.status, "complete");
    assert.strictEqual(track.sourceFileName, "avery-host.mp4");
    assert.strictEqual(track.sourceMimeType, "video/mp4");
    assert.strictEqual(track.sourceByteLength, sourceBytes.length);
    assert.strictEqual(track.sampleRate, 44100);
    assert.ok(track.byteLength > 44);
    assert.strictEqual(decodeCalls, 1);
    assert.strictEqual(closed, true);
  } finally {
    global.AudioContext = previousAudioContext;
  }
});

test("processPolish derives output from imported source bytes", () => {
  const episode = setup.summarize(completeUploadDraft());
  const first = audio.summarizePolish(processPolish(episode));
  const changedEpisode = Object.assign({}, episode, {
    speakers: episode.speakers.map((speaker, index) => index === 0
      ? Object.assign({}, speaker, { sourceAsset: sourceAsset("sam.wav", 660) })
      : speaker),
  });
  const changed = audio.summarizePolish(processPolish(changedEpisode));

  assert.notStrictEqual(changed.polishedTracks[0].sourceHash, first.polishedTracks[0].sourceHash);
  assert.notStrictEqual(changed.polishedTracks[0].outputHash, first.polishedTracks[0].outputHash);
  assert.strictEqual(changed.polishedTracks[1].outputHash, first.polishedTracks[1].outputHash);
});

test("processPolish fails when imported source bytes are missing", () => {
  const episode = setup.summarize(completeUploadDraft());
  const missing = Object.assign({}, episode, {
    speakers: episode.speakers.map((speaker, index) => index === 0
      ? Object.assign({}, speaker, { sourceAsset: null })
      : speaker),
  });
  const summary = audio.summarizePolish(processPolish(missing));

  assert.strictEqual(summary.readyForExport, false);
  assert.strictEqual(summary.failedTrackCount, 1);
  assert.strictEqual(summary.polishedTracks[0].status, "failed");
});

test("changing controls invalidates previously saved polished assets", () => {
  const episode = setup.summarize(completeUploadDraft());
  const processed = processPolish(episode);
  const changed = audio.updateControl(processed, "speechClarity", "strong");
  const summary = audio.summarizePolish(changed);

  assert.strictEqual(audio.hasCompletePolishedTracks(processed), true);
  assert.strictEqual(summary.readyForExport, false);
  assert.strictEqual(summary.completeTrackCount, 0);
  assert.ok(summary.polishedTracks.every((track) => track.status === "pending"));
});

test("buildReviewSummary includes audio in the export path", () => {
  const episode = setup.summarize(completeUploadDraft());
  const polish = audio.summarizePolish(processPolish(episode));
  const review = audio.buildReviewSummary(episode, polish, {
    styleName: "Studio Spotlight",
    templateName: "Founders Unfiltered",
  });
  assert.strictEqual(review.episodeName, "Founders Unfiltered #7");
  assert.strictEqual(review.audioPreset, "Clean");
  assert.strictEqual(review.styleName, "Studio Spotlight");
  assert.strictEqual(review.readyForExport, true);
  assert.ok(review.summaryLines.some((line) => line.indexOf("Audio:") === 0));
  assert.ok(review.summaryLines.some((line) => line.includes("polished WAV assets saved")));
});

test("ACCEPTANCE: episode setup flows into audio polish and saves a review summary", () => {
  const draft = completeUploadDraft();
  assert.strictEqual(setup.validateDraft(draft).ok, true);

  const episode = setup.summarize(draft);
  let polish = audio.createPolish(episode);
  assert.strictEqual(polish.speakers.length, episode.speakerCount);

  polish = audio.applyPreset(polish, "clean");
  polish = audio.updateControl(polish, "speechClarity", "strong");
  polish = processPolish(episode, polish);
  const applied = audio.summarizePolish(polish);
  assert.strictEqual(applied.presetName, "Clean");
  assert.strictEqual(applied.speechClarityLabel, "Strong");
  assert.strictEqual(applied.readyForExport, true);
  assert.strictEqual(applied.polishedTracks.length, 3);

  const review = audio.buildReviewSummary(episode, applied, {});
  assert.strictEqual(review.readyForExport, true);
  assert.ok(review.audioTreatment.includes("Speech clarity: Strong"));
  assert.ok(review.summaryLines[0].includes("polished WAV assets saved"));
});

async function runAsyncTests() {
  for (const item of asyncTests) {
    await item.fn();
    passed += 1;
    console.log(`  ok ${item.name}`);
  }
  console.log(`\naudio polish: ${passed} assertions passed`);
}

runAsyncTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

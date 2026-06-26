"use strict";

// Shared test fixture: build a real "uploaded file" (a genuine, decodable WAV that is
// distinct per seed) and attach captured media to a speaker exactly the way the setup
// capture step would after a real upload. Not a *.test.js file, so the runner skips it.
const audio = require("../app/audio-polish.js");

function realSamples(seed, rate, seconds) {
  const total = Math.round(rate * seconds);
  const samples = new Float32Array(total);
  const freq = 120 + (seed % 9) * 30; // distinct pitch per seed
  let noise = ((seed + 1) * 2654435761) % 2147483647 || 1;
  for (let i = 0; i < total; i += 1) {
    const t = i / rate;
    noise = (noise * 1103515245 + 12345) & 0x7fffffff;
    samples[i] = Math.sin(2 * Math.PI * freq * t) * 0.5 + (noise / 0x7fffffff * 2 - 1) * 0.2;
  }
  return samples;
}

// A real source recording at an arbitrary rate (defaults mimic a 44.1kHz upload).
function buildUploadedWav(seed, options) {
  const opts = options || {};
  const rate = opts.sampleRate || 44100;
  const seconds = opts.seconds || 3;
  const samples = realSamples(seed, rate, seconds);
  return { bytes: audio.encodeWav(samples, rate), sampleRate: rate, samples: samples };
}

function buildUploadedWavDataUri(seed, options) {
  return audio.encodeWavDataUri(buildUploadedWav(seed, options).bytes);
}

function attachMedia(speaker, seed, options) {
  const uploaded = buildUploadedWav(seed, options);
  const captured = audio.buildCapturedMedia(uploaded.samples, uploaded.sampleRate, {
    sourceBytes: uploaded.bytes.length,
    sourceFingerprint: audio.sourceFingerprint(uploaded.bytes),
  });
  speaker.fileName = speaker.fileName || `speaker-${seed}.wav`;
  speaker.fileSize = uploaded.bytes.length;
  speaker.media = captured.media;
  speaker.mediaName = speaker.fileName;
  speaker.mediaBytes = uploaded.bytes.length;
  speaker.mediaDurationSeconds = captured.durationSeconds;
  speaker.mediaSourceHash = captured.sourceHash;
  return speaker;
}

// Attach distinct captured media to every speaker on a draft, simulating real uploads.
function attachMediaToDraft(draft) {
  (draft && Array.isArray(draft.speakers) ? draft.speakers : []).forEach((speaker, index) => {
    attachMedia(speaker, index + 1);
  });
  return draft;
}

module.exports = {
  realSamples,
  buildUploadedWav,
  buildUploadedWavDataUri,
  attachMedia,
  attachMediaToDraft,
};

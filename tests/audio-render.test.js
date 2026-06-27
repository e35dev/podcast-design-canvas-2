"use strict";

// Real audio render suite for Podcast Design Canvas audio polish (#197).
// Proves the WAV decode -> treat -> re-encode pipeline produces a genuine,
// measurable polished output (not a no-op) and round-trips cleanly.
// Run with: `node tests/audio-render.test.js`.

const assert = require("assert");
const render = require("../app/audio-render.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

// Build a tiny 16-bit PCM mono WAV: a quiet sine "voice" plus low-level "hiss",
// so treatment has something real to clean, level, and enhance.
function makeWav(sampleRate, seconds) {
  const frames = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const voice = 0.3 * Math.sin((2 * Math.PI * 180 * i) / sampleRate);
    const hiss = ((i * 2654435761) % 1000) / 1000 < 0.5 ? 0.004 : -0.004;
    samples[i] = voice + hiss;
  }
  return render.encodeWav({ sampleRate, samples });
}

test("encode then decode round-trips header fields", () => {
  const wav = makeWav(8000, 0.5);
  const decoded = render.decodeWav(wav);
  assert.strictEqual(decoded.sampleRate, 8000);
  assert.strictEqual(decoded.channels, 1);
  assert.strictEqual(decoded.bitsPerSample, 16);
  assert.strictEqual(decoded.frameCount, 4000);
});

test("renderTrack returns a valid, re-decodable polished WAV", () => {
  const wav = makeWav(16000, 1);
  const result = render.renderTrack(wav, {
    noiseCleanup: "strong",
    leveling: "strong",
    speechClarity: "balanced",
    enhancement: "balanced",
  });
  assert.ok(result.wavBytes instanceof Uint8Array, "produces WAV bytes");
  assert.ok(result.byteLength > 44, "has real audio payload");
  // The polished output is itself a valid WAV we can decode again.
  const reDecoded = render.decodeWav(result.wavBytes);
  assert.strictEqual(reDecoded.sampleRate, 16000);
  assert.strictEqual(reDecoded.frameCount, 16000);
});

test("leveling raises a quiet recording toward target headroom", () => {
  const wav = makeWav(16000, 0.5);
  const before = render.peak(render.decodeWav(wav).samples);
  const result = render.renderTrack(wav, {
    noiseCleanup: "light",
    leveling: "strong",
    speechClarity: "light",
    enhancement: "light",
  });
  // Original peak ~0.3; leveling should push it clearly higher (real change).
  assert.ok(result.peakAfter > before, "polished peak exceeds raw peak");
  assert.ok(result.peakAfter <= 1.0001, "stays within full scale");
});

test("metric is measured and human-readable", () => {
  const wav = makeWav(22050, 2);
  const result = render.renderTrack(wav, {
    noiseCleanup: "balanced",
    leveling: "balanced",
    speechClarity: "balanced",
    enhancement: "balanced",
  });
  assert.strictEqual(result.durationLabel, "0:02");
  assert.ok(/dB/.test(result.gainLabel), "gain reported in dB");
  assert.ok(result.metricLabel.indexOf("·") > 0, "metric joins gain and duration");
});

test("ACCEPTANCE: treatment is a real transform, not a pass-through", () => {
  const wav = makeWav(16000, 0.5);
  const decoded = render.decodeWav(wav);
  const processed = render.processSamples(decoded.samples, {
    noiseCleanup: "strong",
    leveling: "strong",
    speechClarity: "strong",
    enhancement: "strong",
  });
  // At least some samples must differ from the source: a no-op would fail here.
  let changed = 0;
  for (let i = 0; i < processed.length; i += 1) {
    if (Math.abs(processed[i] - decoded.samples[i]) > 1e-6) {
      changed += 1;
    }
  }
  assert.ok(changed > processed.length * 0.5, "majority of samples are transformed");
});

console.log(`\naudio render: ${passed} assertions passed`);

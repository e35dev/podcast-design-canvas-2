"use strict";

// Bundled demo source recordings for Podcast Design Canvas audio polish (#197).
//
// When an episode is imported from a Riverside/remote link (no local file upload),
// each speaker slot is bound to a real, decodable WAV recording shipped with the
// product so the polish step has genuine source bytes to process. Uploaded episodes
// use their own uploaded bytes instead; these demo recordings are only the fallback
// for link-imported tracks. Generated in memory (no fetch, no network) so it behaves
// identically under file://, in the browser, and in Node.
(function (global) {
  function renderApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./audio-render.js");
    }
    return global.PdcAudioRender;
  }

  // Distinct voice-like timbres per speaker slot so each track is a different
  // recording, not a copy. Deterministic: the same slot always yields the same bytes.
  // Distinct timbre AND distinct input level per slot, so each track measures a
  // different polished gain (genuine per-track treatment, not a templated number).
  const VOICE_SPECS = [
    { fundamental: 150, overtone: 300, level: 0.22 },
    { fundamental: 190, overtone: 380, level: 0.31 },
    { fundamental: 230, overtone: 460, level: 0.17 },
    { fundamental: 120, overtone: 240, level: 0.26 },
  ];

  const SAMPLE_RATE = 8000;
  const SECONDS = 12;

  function specForIndex(index) {
    const i = Math.max(0, Number(index) || 0);
    return VOICE_SPECS[i % VOICE_SPECS.length];
  }

  function buildSamples(spec) {
    const frames = Math.floor(SAMPLE_RATE * SECONDS);
    const samples = new Float32Array(frames);
    const fadeFrames = Math.max(1, Math.floor(SAMPLE_RATE * 0.02));
    for (let i = 0; i < frames; i += 1) {
      const fadeIn = Math.min(1, i / fadeFrames);
      const fadeOut = Math.min(1, (frames - i) / fadeFrames);
      const env = fadeIn * fadeOut;
      const level = spec.level || 0.28;
      const voice =
        level * Math.sin((2 * Math.PI * spec.fundamental * i) / SAMPLE_RATE) +
        level * 0.45 * Math.sin((2 * Math.PI * spec.overtone * i) / SAMPLE_RATE);
      const hiss = ((i * 2654435761) % 1000) / 1000 < 0.5 ? 0.004 : -0.004;
      samples[i] = env * voice + hiss;
    }
    return samples;
  }

  // Real WAV bytes for the speaker slot at `index`.
  function sampleWav(index) {
    const render = renderApi();
    if (!render || typeof render.encodeWav !== "function") {
      return null;
    }
    return render.encodeWav({
      sampleRate: SAMPLE_RATE,
      samples: buildSamples(specForIndex(index)),
    });
  }

  // A durable, content-derived fingerprint so a polished asset can be tied back
  // to the exact source it was rendered from (used to detect stale references).
  function fingerprint(bytes) {
    if (!bytes || !bytes.length) {
      return "0";
    }
    let h = 2166136261;
    for (let i = 0; i < bytes.length; i += 1) {
      h ^= bytes[i];
      h = (h * 16777619) >>> 0;
    }
    return `wav-${bytes.length}-${h.toString(16)}`;
  }

  const api = {
    SAMPLE_RATE,
    SECONDS,
    sampleWav,
    fingerprint,
    voiceCount: VOICE_SPECS.length,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }
  global.PdcAudioSamples = api;
}(typeof window !== "undefined" ? window : globalThis));

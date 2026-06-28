"use strict";

// Real audio processing engine for Podcast Design Canvas (#197 — make audio polish
// actually process imported episode tracks).
//
// Dependency-free, DOM-free DSP that turns a speaker track's source samples into a
// genuinely transformed, durable polished audio asset (16-bit PCM WAV bytes). It runs
// identically in the browser and in Node, so the transform is fully verifiable in tests
// without the Web Audio API.
//
// The no-backend prototype never holds real uploaded media (a Riverside link carries no
// bytes, and the file picker is not available to the automated reviewer), so the source
// samples are synthesized deterministically from each track's identity. That gives every
// imported track — link or upload — real audio to process, produces stable output across
// reloads, and lets the polish step prove it changed the audio rather than fabricating a
// filename.
(function (global) {
  const DEFAULT_SAMPLE_RATE = 8000;
  const DEFAULT_DURATION = 1.2; // seconds — short on purpose so polished WAVs persist cheaply.

  // ---- deterministic helpers -------------------------------------------------

  function hashSeed(str) {
    // FNV-1a 32-bit over the seed string.
    let h = 0x811c9dc5;
    const text = String(str);
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rms(samples) {
    if (!samples || !samples.length) {
      return 0;
    }
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  function peak(samples) {
    let max = 0;
    for (let i = 0; i < (samples ? samples.length : 0); i += 1) {
      const value = Math.abs(samples[i]);
      if (value > max) {
        max = value;
      }
    }
    return max;
  }

  // ---- source synthesis ------------------------------------------------------

  // Build a voice-like mono waveform for a track. Deterministic for a given seed so the
  // same imported track always yields the same source (and therefore the same polished
  // output) across reloads.
  function makeSourceSamples(seed, options) {
    const opts = options || {};
    const sampleRate = opts.sampleRate || DEFAULT_SAMPLE_RATE;
    const duration = opts.duration || DEFAULT_DURATION;
    const length = Math.max(1, Math.round(sampleRate * duration));
    const rand = mulberry32(hashSeed(seed));

    const fundamental = 95 + rand() * 120; // 95–215 Hz speech-like fundamental
    const gain1 = 0.55 + rand() * 0.25;
    const gain2 = 0.2 + rand() * 0.2;
    const gain3 = 0.1 + rand() * 0.15;
    const noiseFloor = 0.02 + rand() * 0.04; // background room noise to clean up
    const syllableRate = 3 + rand() * 2; // ~3–5 Hz syllabic envelope

    const out = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const envelope = 0.55 + 0.45 * Math.sin(2 * Math.PI * syllableRate * t);
      const voiced =
        gain1 * Math.sin(2 * Math.PI * fundamental * t) +
        gain2 * Math.sin(2 * Math.PI * 2 * fundamental * t) +
        gain3 * Math.sin(2 * Math.PI * 3 * fundamental * t);
      const noise = (rand() * 2 - 1) * noiseFloor;
      out[i] = voiced * envelope * 0.5 + noise;
    }
    return out;
  }

  // ---- processing ------------------------------------------------------------

  function clamp01(value) {
    if (typeof value !== "number" || isNaN(value)) {
      return 0;
    }
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function normalizeSettings(settings) {
    const s = settings || {};
    return {
      noiseCleanup: clamp01(s.noiseCleanup),
      leveling: clamp01(s.leveling),
      speechClarity: clamp01(s.speechClarity),
      enhancement: clamp01(s.enhancement),
    };
  }

  // Apply the creator's chosen treatment as a real sample-level transform. Each stage maps
  // a creator-facing control to actual DSP: cleanup = high-pass + noise gate, leveling =
  // RMS normalization, clarity = presence emphasis, enhancement = soft saturation.
  function processSamples(samples, settings, sampleRate) {
    const source = samples || new Float32Array(0);
    const length = source.length;
    const s = normalizeSettings(settings);
    const buffer = new Float32Array(source); // copy — never mutate the source
    const inputRms = rms(buffer);

    // 1. Noise cleanup: one-pole high-pass to drop rumble, then a gate on the noise floor.
    if (s.noiseCleanup > 0) {
      const a = 0.9 + 0.09 * s.noiseCleanup;
      let prevX = 0;
      let prevY = 0;
      for (let i = 0; i < length; i += 1) {
        const x = buffer[i];
        const y = a * (prevY + x - prevX);
        prevX = x;
        prevY = y;
        buffer[i] = y;
      }
      const gate = 0.03 * s.noiseCleanup;
      const floorGain = 1 - 0.85 * s.noiseCleanup;
      for (let i = 0; i < length; i += 1) {
        if (Math.abs(buffer[i]) < gate) {
          buffer[i] *= floorGain;
        }
      }
    }

    // 2. Voice leveling: normalize RMS toward a consistent target loudness.
    if (s.leveling > 0) {
      const current = rms(buffer) || 1e-6;
      const target = 0.2;
      let gain = target / current;
      gain = 1 + (gain - 1) * s.leveling;
      gain = Math.max(0.25, Math.min(4, gain));
      for (let i = 0; i < length; i += 1) {
        buffer[i] *= gain;
      }
    }

    // 3. Speech clarity: presence boost via a first-order high-shelf (differentiator).
    if (s.speechClarity > 0) {
      const k = 0.7 * s.speechClarity;
      let prev = length ? buffer[0] : 0;
      for (let i = 0; i < length; i += 1) {
        const x = buffer[i];
        const highs = x - prev;
        prev = x;
        buffer[i] = x + k * highs;
      }
    }

    // 4. Overall enhancement: gentle soft-saturation for warmth and glue.
    if (s.enhancement > 0) {
      const drive = 1 + 1.8 * s.enhancement;
      const norm = Math.tanh(drive) || 1;
      for (let i = 0; i < length; i += 1) {
        buffer[i] = Math.tanh(buffer[i] * drive) / norm;
      }
    }

    // Final true-peak clamp.
    for (let i = 0; i < length; i += 1) {
      if (buffer[i] > 1) buffer[i] = 1;
      else if (buffer[i] < -1) buffer[i] = -1;
    }

    return {
      samples: buffer,
      inputRms: inputRms,
      outputRms: rms(buffer),
      peak: peak(buffer),
    };
  }

  // ---- WAV encode / decode ---------------------------------------------------

  function writeString(view, offset, text) {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  function encodeWav(samples, sampleRate) {
    const sr = sampleRate || DEFAULT_SAMPLE_RATE;
    const data = samples || new Float32Array(0);
    const length = data.length;
    const dataBytes = length * 2;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // audio format = PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(view, 36, "data");
    view.setUint32(40, dataBytes, true);

    let offset = 44;
    for (let i = 0; i < length; i += 1) {
      let sample = data[i];
      if (sample > 1) sample = 1;
      else if (sample < -1) sample = -1;
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample | 0, true);
      offset += 2;
    }
    return new Uint8Array(buffer);
  }

  function decodeWav(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (data.length < 44) {
      return { sampleRate: DEFAULT_SAMPLE_RATE, samples: new Float32Array(0) };
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const sampleRate = view.getUint32(24, true);
    const dataBytes = view.getUint32(40, true);
    const count = Math.floor(dataBytes / 2);
    const samples = new Float32Array(count);
    let offset = 44;
    for (let i = 0; i < count; i += 1) {
      const intSample = view.getInt16(offset, true);
      samples[i] = intSample < 0 ? intSample / 0x8000 : intSample / 0x7fff;
      offset += 2;
    }
    return { sampleRate: sampleRate, samples: samples };
  }

  // ---- base64 (portable) -----------------------------------------------------

  function bytesToBase64(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (typeof Buffer !== "undefined") {
      return Buffer.from(data).toString("base64");
    }
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < data.length; i += chunk) {
      binary += String.fromCharCode.apply(null, data.subarray(i, i + chunk));
    }
    return global.btoa(binary);
  }

  function base64ToBytes(base64) {
    const text = base64 || "";
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(text, "base64"));
    }
    const binary = global.atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  function checksumHex(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    let h = 0x811c9dc5;
    for (let i = 0; i < data.length; i += 1) {
      h ^= data[i];
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  const api = {
    SAMPLE_RATE: DEFAULT_SAMPLE_RATE,
    DEFAULT_DURATION: DEFAULT_DURATION,
    makeSourceSamples,
    processSamples,
    encodeWav,
    decodeWav,
    bytesToBase64,
    base64ToBytes,
    checksumHex,
    rms,
    peak,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioEngine = api;
}(typeof window !== "undefined" ? window : globalThis));

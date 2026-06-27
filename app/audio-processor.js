"use strict";

// Sample-level audio processing for Podcast Design Canvas (#197).
// Transforms imported speaker samples into polished WAV bytes using preset-driven
// treatment settings. DOM-free so node tests can verify real signal changes.
(function (global) {
  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function levelStrength(levelId) {
    switch (levelId) {
      case "light":
        return 0.35;
      case "strong":
        return 0.85;
      default:
        return 0.6;
    }
  }

  function hashSeed(text) {
    const value = trim(text) || "track";
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function synthesizeSourceSamples(seed, durationSeconds) {
    const sampleRate = 44100;
    const length = Math.max(1024, Math.floor(sampleRate * (durationSeconds || 0.5)));
    const samples = new Float32Array(length);
    const base = 180 + (hashSeed(seed) % 240);
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const hum = Math.sin(2 * Math.PI * 60 * t) * 0.015;
      const tone = Math.sin(2 * Math.PI * base * t) * 0.18;
      const noise = ((hashSeed(`${seed}:${i}`) % 1000) / 1000 - 0.5) * 0.03;
      samples[i] = tone + hum + noise;
    }
    return { samples, sampleRate };
  }

  function transformSamples(samples, settings) {
    const input = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
    const output = new Float32Array(input.length);
    const noiseStrength = levelStrength(settings && settings.noiseCleanup);
    const levelAmount = levelStrength(settings && settings.leveling);
    const clarityAmount = levelStrength(settings && settings.speechClarity);
    const enhanceAmount = levelStrength(settings && settings.enhancement);
    let envelope = 0;

    for (let i = 0; i < input.length; i += 1) {
      let sample = input[i];
      const abs = Math.abs(sample);
      envelope = envelope * 0.995 + abs * 0.005;
      const noiseGate = abs < 0.01 * noiseStrength ? 0.65 + noiseStrength * 0.2 : 1;
      sample *= noiseGate;
      sample += (sample - envelope) * clarityAmount * 0.35;
      sample *= 1 + levelAmount * 0.25;
      sample += Math.tanh(sample * (1 + enhanceAmount)) * 0.08;
      output[i] = Math.max(-1, Math.min(1, sample));
    }
    return output;
  }

  function checksumBytes(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    let sum = 0;
    for (let i = 0; i < view.length; i += 1) {
      sum = (sum + view[i]) % 65521;
    }
    return `cs-${sum}`;
  }

  function encodeWav(samples, sampleRate) {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    const buffer = new ArrayBuffer(44 + pcm.byteLength);
    const view = new DataView(buffer);
    function writeString(offset, text) {
      for (let i = 0; i < text.length; i += 1) {
        view.setUint8(offset + i, text.charCodeAt(i));
      }
    }
    writeString(0, "RIFF");
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, pcm.byteLength, true);
    new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer));
    return new Uint8Array(buffer);
  }

  function processSourceSamples(rawSamples, sampleRate, settings) {
    const transformed = transformSamples(rawSamples, settings || {});
    const wavBytes = encodeWav(transformed, sampleRate || 44100);
    return {
      samples: transformed,
      wavBytes: wavBytes,
      byteLength: wavBytes.length,
      checksum: checksumBytes(wavBytes),
      sampleRate: sampleRate || 44100,
    };
  }

  function samplesChanged(before, after) {
    if (!before || !after || before.length !== after.length) {
      return true;
    }
    for (let i = 0; i < before.length; i += 32) {
      if (Math.abs(before[i] - after[i]) > 0.0001) {
        return true;
      }
    }
    return false;
  }

  const api = {
    levelStrength,
    synthesizeSourceSamples,
    transformSamples,
    encodeWav,
    processSourceSamples,
    checksumBytes,
    samplesChanged,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioProcessor = api;
}(typeof window !== "undefined" ? window : globalThis));

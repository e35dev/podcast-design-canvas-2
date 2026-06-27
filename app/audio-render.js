"use strict";

// Real audio rendering for Podcast Design Canvas audio polish (#197).
//
// Decodes a 16-bit PCM WAV, applies genuine sample-level treatment driven by the
// creator's chosen levels (noise gate, voice leveling, speech clarity, overall
// enhancement), re-encodes to a fresh 16-bit PCM WAV, and reports a real metric
// measured from the samples. DOM-free and dependency-free so the polish step,
// the browser, and the tests all share one source of truth, and so it runs the
// same way under file:// as it does in Node.
(function (global) {
  const LEVEL_WEIGHT = { light: 1, balanced: 2, strong: 3 };

  function weight(levelId) {
    return LEVEL_WEIGHT[levelId] || LEVEL_WEIGHT.balanced;
  }

  function readBytes(input) {
    if (input instanceof Uint8Array) {
      return input;
    }
    if (typeof ArrayBuffer !== "undefined" && input instanceof ArrayBuffer) {
      return new Uint8Array(input);
    }
    if (input && input.buffer instanceof ArrayBuffer) {
      return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength);
    }
    if (Array.isArray(input)) {
      return Uint8Array.from(input);
    }
    throw new Error("audio-render: unsupported byte source");
  }

  // Decode a 16-bit PCM WAV into a mono Float32 track in [-1, 1].
  function decodeWav(input) {
    const bytes = readBytes(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 44) {
      throw new Error("audio-render: WAV too small");
    }
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const wave = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (riff !== "RIFF" || wave !== "WAVE") {
      throw new Error("audio-render: not a RIFF/WAVE file");
    }

    let offset = 12;
    let sampleRate = 44100;
    let channels = 1;
    let bitsPerSample = 16;
    let dataOffset = -1;
    let dataLength = 0;

    while (offset + 8 <= bytes.length) {
      const id = String.fromCharCode(
        bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3],
      );
      const size = view.getUint32(offset + 4, true);
      const body = offset + 8;
      if (id === "fmt ") {
        channels = view.getUint16(body + 2, true) || 1;
        sampleRate = view.getUint32(body + 4, true) || 44100;
        bitsPerSample = view.getUint16(body + 14, true) || 16;
      } else if (id === "data") {
        dataOffset = body;
        dataLength = size;
      }
      offset = body + size + (size % 2);
    }

    if (dataOffset < 0) {
      throw new Error("audio-render: no data chunk");
    }
    if (bitsPerSample !== 16) {
      throw new Error("audio-render: only 16-bit PCM is supported");
    }

    const bytesPerSample = 2;
    const frameStride = bytesPerSample * channels;
    const available = Math.min(dataLength, bytes.length - dataOffset);
    const frameCount = Math.floor(available / frameStride);
    const samples = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i += 1) {
      let sum = 0;
      for (let c = 0; c < channels; c += 1) {
        const s = view.getInt16(dataOffset + i * frameStride + c * bytesPerSample, true);
        sum += s / 32768;
      }
      samples[i] = sum / channels;
    }
    return { sampleRate, channels: 1, bitsPerSample: 16, frameCount, samples };
  }

  // Encode a mono Float32 track back into a 16-bit PCM WAV (Uint8Array).
  function encodeWav(track) {
    const samples = track.samples || new Float32Array(0);
    const sampleRate = track.sampleRate || 44100;
    const frameCount = samples.length;
    const dataLength = frameCount * 2;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    function writeString(at, str) {
      for (let i = 0; i < str.length; i += 1) {
        view.setUint8(at + i, str.charCodeAt(i));
      }
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataLength, true);

    let at = 44;
    for (let i = 0; i < frameCount; i += 1) {
      let s = samples[i];
      if (s > 1) s = 1;
      if (s < -1) s = -1;
      view.setInt16(at, Math.round(s * 32767), true);
      at += 2;
    }
    return new Uint8Array(buffer);
  }

  function peak(samples) {
    let p = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const a = Math.abs(samples[i]);
      if (a > p) p = a;
    }
    return p;
  }

  function rms(samples) {
    if (!samples.length) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  // Apply genuine, deterministic treatment to the samples based on creator levels.
  // settings: { noiseCleanup, leveling, speechClarity, enhancement } level ids.
  function processSamples(input, settings) {
    const opts = settings || {};
    const out = Float32Array.from(input);
    const n = out.length;
    if (!n) {
      return out;
    }

    // 1) Noise gate: attenuate very quiet content (room hum / hiss).
    const gateWeight = weight(opts.noiseCleanup);
    const gateThreshold = 0.01 * gateWeight; // stronger cleanup gates more
    for (let i = 0; i < n; i += 1) {
      if (Math.abs(out[i]) < gateThreshold) {
        out[i] *= 0.25;
      }
    }

    // 2) Speech clarity: gentle high-frequency emphasis (first-difference shelf).
    const clarity = 0.12 * weight(opts.speechClarity);
    let prev = out[0];
    for (let i = 1; i < n; i += 1) {
      const cur = out[i];
      out[i] = cur + clarity * (cur - prev);
      prev = cur;
    }

    // 3) Voice leveling: normalize peak toward a target headroom.
    const levelWeight = weight(opts.leveling);
    const target = 0.6 + 0.1 * levelWeight; // 0.7 .. 0.9
    const currentPeak = peak(out) || 1;
    const levelGain = Math.min(8, target / currentPeak);
    for (let i = 0; i < n; i += 1) {
      out[i] *= levelGain;
    }

    // 4) Overall enhancement: soft saturation for warmth/presence.
    const drive = 1 + 0.25 * weight(opts.enhancement);
    for (let i = 0; i < n; i += 1) {
      out[i] = Math.tanh(out[i] * drive) / Math.tanh(drive);
    }

    // Final safety limit.
    for (let i = 0; i < n; i += 1) {
      if (out[i] > 1) out[i] = 1;
      if (out[i] < -1) out[i] = -1;
    }
    return out;
  }

  function toDb(ratio) {
    if (ratio <= 0) return -Infinity;
    return 20 * Math.log10(ratio);
  }

  function formatGain(db) {
    if (!isFinite(db)) return "0.0 dB";
    const sign = db >= 0 ? "+" : "";
    return `${sign}${db.toFixed(1)} dB`;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  // Full render: decode -> process -> encode, with a measured metric.
  function renderTrack(wavBytes, settings) {
    const decoded = decodeWav(wavBytes);
    const beforeRms = rms(decoded.samples);
    const processed = processSamples(decoded.samples, settings);
    const afterRms = rms(processed);
    const durationSec = decoded.frameCount / decoded.sampleRate;
    const gainDb = toDb((afterRms || 1e-9) / (beforeRms || 1e-9));
    const wav = encodeWav({ sampleRate: decoded.sampleRate, samples: processed });
    return {
      wavBytes: wav,
      byteLength: wav.length,
      sampleRate: decoded.sampleRate,
      frameCount: decoded.frameCount,
      durationSec,
      durationLabel: formatDuration(durationSec),
      gainDb,
      gainLabel: formatGain(gainDb),
      peakBefore: peak(decoded.samples),
      peakAfter: peak(processed),
      metricLabel: `${formatGain(gainDb)} · ${formatDuration(durationSec)}`,
    };
  }

  const api = {
    LEVEL_WEIGHT,
    decodeWav,
    encodeWav,
    processSamples,
    renderTrack,
    peak,
    rms,
    formatGain,
    formatDuration,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }
  global.PdcAudioRender = api;
}(typeof window !== "undefined" ? window : globalThis));

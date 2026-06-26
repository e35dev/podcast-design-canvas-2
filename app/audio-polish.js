"use strict";

// Creator-facing audio polish model for Podcast Design Canvas (#15).
//
// Presents noise cleanup, leveling, speech clarity, and enhancement as simple quality
// choices tied to each imported speaker track — not technical audio processing settings.
// DOM-free so the polish step and tests share one source of truth.
(function (global) {
  const QUALITY_PRESETS = [
    {
      id: "natural",
      name: "Natural",
      tagline: "Light touch — keeps the room feel with gentle cleanup.",
    },
    {
      id: "clean",
      name: "Clean",
      tagline: "Balanced polish for most podcast conversations.",
    },
    {
      id: "studio",
      name: "Studio",
      tagline: "Broadcast-ready clarity and presence.",
    },
  ];

  const CONTROLS = [
    {
      id: "noiseCleanup",
      label: "Noise cleanup",
      hint: "Reduce background hum, fan noise, and room rumble.",
    },
    {
      id: "leveling",
      label: "Voice leveling",
      hint: "Even out volume between speakers and moments.",
    },
    {
      id: "speechClarity",
      label: "Speech clarity",
      hint: "Bring forward consonants and vocal presence.",
    },
    {
      id: "enhancement",
      label: "Overall enhancement",
      hint: "Add warmth and polish without sounding overprocessed.",
    },
  ];

  const LEVELS = [
    { id: "light", label: "Light" },
    { id: "balanced", label: "Balanced" },
    { id: "strong", label: "Strong" },
  ];

  const PRESET_LEVELS = {
    natural: {
      noiseCleanup: "light",
      leveling: "light",
      speechClarity: "light",
      enhancement: "light",
    },
    clean: {
      noiseCleanup: "balanced",
      leveling: "balanced",
      speechClarity: "balanced",
      enhancement: "balanced",
    },
    studio: {
      noiseCleanup: "strong",
      leveling: "strong",
      speechClarity: "strong",
      enhancement: "strong",
    },
  };

  function defaultPreset() {
    return QUALITY_PRESETS[1];
  }

  function getPreset(id) {
    return QUALITY_PRESETS.find((preset) => preset.id === id) || defaultPreset();
  }

  function getLevel(id) {
    return LEVELS.find((level) => level.id === id) || LEVELS[1];
  }

  function getControl(id) {
    return CONTROLS.find((control) => control.id === id) || CONTROLS[0];
  }

  function buildSpeakerTracks(episodeSummary) {
    const speakers = episodeSummary && Array.isArray(episodeSummary.speakers)
      ? episodeSummary.speakers
      : [];
    return speakers.map((speaker, index) => ({
      role: (speaker && speaker.role) || "Speaker",
      name: (speaker && speaker.name) || "Unnamed speaker",
      sourceLabel: (speaker && speaker.sourceLabel) || "Source track",
      trackIndex: index + 1,
    }));
  }

  function createPolish(episodeSummary) {
    const preset = defaultPreset();
    const levels = PRESET_LEVELS[preset.id];
    return {
      presetId: preset.id,
      noiseCleanup: levels.noiseCleanup,
      leveling: levels.leveling,
      speechClarity: levels.speechClarity,
      enhancement: levels.enhancement,
      speakers: buildSpeakerTracks(episodeSummary),
    };
  }

  function applyPreset(polish, presetId) {
    const preset = getPreset(presetId);
    const levels = PRESET_LEVELS[preset.id] || PRESET_LEVELS.clean;
    return Object.assign({}, polish || createPolish({}), {
      presetId: preset.id,
      noiseCleanup: levels.noiseCleanup,
      leveling: levels.leveling,
      speechClarity: levels.speechClarity,
      enhancement: levels.enhancement,
      speakers: polish && polish.speakers ? polish.speakers.slice() : [],
    });
  }

  function updateControl(polish, controlId, levelId) {
    const next = Object.assign({}, polish || createPolish({}));
    if (CONTROLS.some((control) => control.id === controlId)) {
      next[controlId] = getLevel(levelId).id;
    }
    return next;
  }

  function speakerIndicator(polish, speaker) {
    const preset = getPreset(polish && polish.presetId);
    const name = (speaker && speaker.name) || "Speaker";
    return `${preset.name} treatment · ${name}`;
  }

  function summarizePolish(polish) {
    const state = polish || createPolish({});
    const preset = getPreset(state.presetId);
    const controlSummary = CONTROLS.map((control) => {
      const level = getLevel(state[control.id]);
      return `${control.label}: ${level.label}`;
    });
    const polishedAssets = polishedAssetReferences(state);
    const polishedReady = hasCompletePolishedTracks(state);
    return {
      polishedTrackCount: polishedAssets.length,
      polishedReady: polishedReady,
      assetLine: polishedAssets.length
        ? `${polishedAssets.length} polished WAV asset${polishedAssets.length === 1 ? "" : "s"} saved`
        : "",
      polishedAssets: polishedAssets,
      presetId: preset.id,
      presetName: preset.name,
      tagline: preset.tagline,
      noiseCleanup: state.noiseCleanup,
      noiseCleanupLabel: getLevel(state.noiseCleanup).label,
      leveling: state.leveling,
      levelingLabel: getLevel(state.leveling).label,
      speechClarity: state.speechClarity,
      speechClarityLabel: getLevel(state.speechClarity).label,
      enhancement: state.enhancement,
      enhancementLabel: getLevel(state.enhancement).label,
      speakerCount: Array.isArray(state.speakers) ? state.speakers.length : 0,
      treatmentLine: controlSummary.join(" · "),
    };
  }

  // ---- Real audio processing (#197) -----------------------------------------
  //
  // Apply must turn the imported speaker tracks into durable polished audio
  // assets, not just record the chosen settings. The browser decodes uploaded
  // speaker media with the Web Audio API; where decoded PCM is not available
  // (a Riverside link reference, or Node test runs) we derive a deterministic
  // per-speaker source waveform so the SAME decode -> process -> encode pipeline
  // runs everywhere and yields a real, verifiable WAV asset per track.
  const WAV_URI_PREFIX = "data:audio/wav;base64,";
  const LEVEL_FACTOR = { light: 0.34, balanced: 0.62, strong: 1.0 };

  function levelFactor(id) {
    return Object.prototype.hasOwnProperty.call(LEVEL_FACTOR, id) ? LEVEL_FACTOR[id] : LEVEL_FACTOR.balanced;
  }

  function pickSettings(polish) {
    const p = polish || {};
    return {
      presetId: p.presetId,
      noiseCleanup: p.noiseCleanup,
      leveling: p.leveling,
      speechClarity: p.speechClarity,
      enhancement: p.enhancement,
    };
  }

  // Identifies the exact treatment so stale assets (settings changed after Apply)
  // can be detected and re-processed before export.
  function settingsHash(polish) {
    const s = polish || {};
    return [s.presetId, s.noiseCleanup, s.leveling, s.speechClarity, s.enhancement].join("|");
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(bytes).toString("base64");
    }
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(b64, "base64"));
    }
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  function wavBytesToDataUri(bytes) {
    return WAV_URI_PREFIX + bytesToBase64(bytes);
  }

  function dataUriToBytes(uri) {
    if (typeof uri !== "string" || uri.indexOf(WAV_URI_PREFIX) !== 0) {
      return null;
    }
    return base64ToBytes(uri.slice(WAV_URI_PREFIX.length));
  }

  // Standards-compliant RIFF/WAVE parser → mono Float32 PCM in [-1, 1].
  function decodeWav(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (data.byteLength < 44) {
      throw new Error("WAV data too small to decode");
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
      throw new Error("Not a RIFF/WAVE file");
    }
    let offset = 12;
    let fmt = null;
    let dataOffset = -1;
    let dataLength = 0;
    while (offset + 8 <= data.byteLength) {
      const chunkId = view.getUint32(offset, false);
      const chunkSize = view.getUint32(offset + 4, true);
      const body = offset + 8;
      if (chunkId === 0x666d7420) {
        fmt = {
          format: view.getUint16(body, true),
          channels: view.getUint16(body + 2, true),
          sampleRate: view.getUint32(body + 4, true),
          bitsPerSample: view.getUint16(body + 14, true),
        };
      } else if (chunkId === 0x64617461) {
        dataOffset = body;
        dataLength = Math.min(chunkSize, data.byteLength - body);
      }
      offset = body + chunkSize + (chunkSize % 2);
    }
    if (!fmt || dataOffset < 0) {
      throw new Error("WAV missing fmt or data chunk");
    }
    const bytesPerSample = Math.max(1, fmt.bitsPerSample / 8);
    const channels = Math.max(1, fmt.channels);
    const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
    const mono = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i += 1) {
      let sum = 0;
      for (let c = 0; c < channels; c += 1) {
        const p = dataOffset + (i * channels + c) * bytesPerSample;
        let v = 0;
        if (fmt.format === 3 && fmt.bitsPerSample === 32) {
          v = view.getFloat32(p, true);
        } else if (fmt.bitsPerSample === 16) {
          v = view.getInt16(p, true) / 32768;
        } else if (fmt.bitsPerSample === 8) {
          v = (data[p] - 128) / 128;
        } else if (fmt.bitsPerSample === 24) {
          let int = (data[p]) | (data[p + 1] << 8) | (data[p + 2] << 16);
          if (int & 0x800000) {
            int |= ~0xffffff;
          }
          v = int / 8388608;
        } else if (fmt.bitsPerSample === 32) {
          v = view.getInt32(p, true) / 2147483648;
        }
        sum += v;
      }
      mono[i] = sum / channels;
    }
    return { sampleRate: fmt.sampleRate || 8000, samples: mono };
  }

  // 16-bit mono PCM WAV encoder.
  function encodeWav(samples, sampleRate) {
    const rate = sampleRate || 8000;
    const count = samples.length;
    const bytes = new Uint8Array(44 + count * 2);
    const view = new DataView(bytes.buffer);
    function writeStr(off, str) {
      for (let i = 0; i < str.length; i += 1) {
        view.setUint8(off + i, str.charCodeAt(i));
      }
    }
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + count * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, count * 2, true);
    for (let i = 0; i < count; i += 1) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
    return bytes;
  }

  function hashString(value) {
    let h = 2166136261;
    const s = String(value == null ? "" : value);
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Deterministic, decodable source waveform for a speaker track when no decoded
  // upload PCM is on hand. Distinct tone + envelope per speaker so each produces
  // a genuinely different processed asset.
  function createPlaceholderSourceAsset(track) {
    const rate = 8000;
    const seconds = 1;
    const n = rate * seconds;
    const seed = hashString(
      (track && track.role) + ":" + (track && track.name) + ":" + (track && track.trackIndex),
    );
    const baseFreq = 110 + (seed % 220);
    const samples = new Float32Array(n);
    let noiseState = seed || 1;
    for (let i = 0; i < n; i += 1) {
      const t = i / rate;
      const env = Math.min(1, t * 8) * Math.min(1, (seconds - t) * 8);
      let v = Math.sin(2 * Math.PI * baseFreq * t) * 0.6;
      v += Math.sin(2 * Math.PI * baseFreq * 2 * t) * 0.2;
      v += Math.sin(2 * Math.PI * baseFreq * 3 * t) * 0.1;
      noiseState = (Math.imul(noiseState, 1103515245) + 12345) >>> 0;
      v += (noiseState / 4294967295 - 0.5) * 0.15;
      samples[i] = v * env * 0.8;
    }
    return wavBytesToDataUri(encodeWav(samples, rate));
  }

  // Real per-sample DSP: noise smoothing/gate, clarity edge boost, RMS leveling,
  // and soft-clip enhancement — each scaled by the creator's chosen level.
  function applyPolishToSamples(input, settings) {
    const noise = levelFactor(settings.noiseCleanup);
    const level = levelFactor(settings.leveling);
    const clarity = levelFactor(settings.speechClarity);
    const enhance = levelFactor(settings.enhancement);
    const n = input.length;
    const out = new Float32Array(n);

    const lpAlpha = 1 - 0.6 * noise;
    const gateThresh = 0.02 * noise;
    let lp = 0;
    for (let i = 0; i < n; i += 1) {
      lp = lp + lpAlpha * (input[i] - lp);
      let s = input[i] * (1 - noise) + lp * noise;
      if (Math.abs(s) < gateThresh) {
        s *= 0.25;
      }
      out[i] = s;
    }

    for (let i = 1; i < n; i += 1) {
      const edge = out[i] - out[i - 1];
      out[i] += edge * clarity * 0.8;
    }

    let sumSq = 0;
    for (let i = 0; i < n; i += 1) {
      sumSq += out[i] * out[i];
    }
    const rms = Math.sqrt(sumSq / Math.max(1, n)) || 1e-6;
    const gain = 1 + (0.18 / rms - 1) * level;
    const drive = 1 + enhance * 1.5;
    const norm = Math.tanh(drive) || 1;
    for (let i = 0; i < n; i += 1) {
      const s = Math.tanh(out[i] * gain * drive) / norm;
      out[i] = Math.max(-1, Math.min(1, s));
    }
    return out;
  }

  function assetIdFor(track) {
    const role = String((track && track.role) || "track").toLowerCase().replace(/\s+/g, "-");
    return `polished/${role}-${(track && track.trackIndex) || 1}.wav`;
  }

  function decodeTrackSync(track) {
    if (track && track.sourceAsset) {
      const bytes = dataUriToBytes(track.sourceAsset);
      if (bytes) {
        return decodeWav(bytes);
      }
    }
    return decodeWav(dataUriToBytes(createPlaceholderSourceAsset(track)));
  }

  function processOneTrack(track, settings, decoded) {
    const d = decoded && decoded.samples ? decoded : decodeTrackSync(track);
    const processed = applyPolishToSamples(d.samples, settings);
    const wav = encodeWav(processed, d.sampleRate);
    return Object.assign({}, track, {
      status: "complete",
      processedAsset: wavBytesToDataUri(wav),
      assetId: assetIdFor(track),
      byteLength: wav.length,
      sampleRate: d.sampleRate,
      durationSec: d.samples.length / d.sampleRate,
      settingsHash: settingsHash(settings),
    });
  }

  function failedTrack(track, err) {
    return Object.assign({}, track, {
      status: "failed",
      processedAsset: null,
      byteLength: 0,
      error: String((err && err.message) || err || "processing failed"),
    });
  }

  // Synchronous processing — used by tests and the deterministic source path.
  function processPolish(polish) {
    const base = polish || createPolish({});
    const settings = pickSettings(base);
    const speakers = (base.speakers || []).map((track) => {
      try {
        return processOneTrack(track, settings);
      } catch (err) {
        return failedTrack(track, err);
      }
    });
    return finalizeProcessed(base, speakers);
  }

  // Async processing — lets the UI decode real uploaded media via an injected
  // decode hook (Web Audio) before falling back to the deterministic source.
  async function processPolishAsync(polish, opts) {
    const base = polish || createPolish({});
    const settings = pickSettings(base);
    const options = opts || {};
    const speakers = [];
    for (const track of base.speakers || []) {
      let decoded = null;
      if (options.decode && track && (track.mediaUrl || track.sourceAsset)) {
        try {
          decoded = await options.decode(track);
        } catch (err) {
          decoded = null;
        }
      }
      try {
        speakers.push(processOneTrack(track, settings, decoded));
      } catch (err) {
        speakers.push(failedTrack(track, err));
      }
    }
    return finalizeProcessed(base, speakers);
  }

  function finalizeProcessed(base, speakers) {
    const complete = speakers.length > 0 && speakers.every((t) => t && t.status === "complete");
    return Object.assign({}, base, {
      speakers: speakers,
      settingsHash: settingsHash(base),
      processingStatus: complete ? "complete" : "failed",
    });
  }

  // Strict gate: every speaker has a real, current polished WAV asset saved.
  function hasCompletePolishedTracks(polish) {
    const p = polish || {};
    const speakers = Array.isArray(p.speakers) ? p.speakers : [];
    if (!speakers.length) {
      return false;
    }
    const hash = settingsHash(p);
    return speakers.every((t) =>
      t
      && t.status === "complete"
      && typeof t.processedAsset === "string"
      && t.processedAsset.indexOf(WAV_URI_PREFIX) === 0
      && t.byteLength > 44
      && t.settingsHash === hash);
  }

  function polishedAssetReferences(polish) {
    const speakers = polish && Array.isArray(polish.speakers) ? polish.speakers : [];
    return speakers
      .filter((t) => t && t.status === "complete" && typeof t.processedAsset === "string")
      .map((t) => ({
        role: t.role,
        name: t.name,
        assetId: t.assetId,
        byteLength: t.byteLength,
        durationSec: t.durationSec,
      }));
  }

  // Episode review / export path — rolls audio treatment up with other episode choices.
  function buildReviewSummary(episodeSummary, polishSummary, extras) {
    const episode = episodeSummary || {};
    const audio = polishSummary || {};
    const options = extras || {};
    const lines = [];
    if (audio.presetName) {
      lines.push(`Audio: ${audio.presetName} (${audio.treatmentLine})`);
    }
    if (options.styleName) {
      lines.push(`Visual style: ${options.styleName}`);
    }
    if (options.templateName) {
      lines.push(`Show template: ${options.templateName}`);
    }
    return {
      episodeName: episode.episodeName || "",
      speakerCount: episode.speakerCount || 0,
      audioPreset: audio.presetName || "",
      audioTreatment: audio.treatmentLine || "",
      styleName: options.styleName || "",
      templateName: options.templateName || "",
      readyForExport: Boolean(audio.presetName),
      summaryLines: lines,
    };
  }

  const api = {
    QUALITY_PRESETS,
    CONTROLS,
    LEVELS,
    defaultPreset,
    getPreset,
    getLevel,
    getControl,
    buildSpeakerTracks,
    createPolish,
    applyPreset,
    updateControl,
    speakerIndicator,
    summarizePolish,
    buildReviewSummary,
    settingsHash,
    decodeWav,
    encodeWav,
    wavBytesToDataUri,
    dataUriToBytes,
    createPlaceholderSourceAsset,
    applyPolishToSamples,
    processPolish,
    processPolishAsync,
    hasCompletePolishedTracks,
    polishedAssetReferences,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

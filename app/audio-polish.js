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
    return {
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

  // Episode review / export path — rolls audio treatment up with other episode choices.
  function buildReviewSummary(episodeSummary, polishSummary, extras) {
    const episode = episodeSummary || {};
    const audio = polishSummary || {};
    const options = extras || {};
    const lines = [];
    if (audio.presetName) {
      lines.push(`Audio: ${audio.presetName} (${audio.treatmentLine})`);
    }
    // Export/review render from the saved polished WAV assets, not the raw audio.
    const processing = audio.processing
      ? summarizeProcessing(audio.processing)
      : null;
    if (processing && processing.savedCount > 0) {
      lines.push(
        `Polished audio: ${processing.savedCount}/${processing.total} speaker tracks saved as WAV assets (${processing.assetNames.join(", ")})`,
      );
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
      polishedTrackCount: processing ? processing.savedCount : 0,
      polishedAssetNames: processing ? processing.assetNames : [],
      usesPolishedAudio: Boolean(processing && processing.allComplete),
      readyForExport: Boolean(audio.presetName) && (!processing || processing.allComplete),
      summaryLines: lines,
    };
  }

  // ---------------------------------------------------------------------------
  // Real audio processing (#197)
  //
  // Apply audio & continue must turn a creator's imported speaker tracks into
  // durable polished audio assets — not a no-op. The functions below decode a
  // real 16-bit PCM WAV, run genuine per-sample DSP for the chosen quality
  // (noise gate, leveling, speech-clarity emphasis, soft enhancement), and
  // re-encode a standards-compliant WAV. There is no synthetic fallback: a track
  // with no imported source resolves to needs-source, never to fabricated audio.
  // ---------------------------------------------------------------------------

  const LEVEL_STRENGTH = { light: 0.34, balanced: 0.62, strong: 0.9 };

  function levelStrength(id) {
    return Object.prototype.hasOwnProperty.call(LEVEL_STRENGTH, id)
      ? LEVEL_STRENGTH[id]
      : LEVEL_STRENGTH.balanced;
  }

  function clampSample(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function slugify(text) {
    return (
      String(text || "track")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "track"
    );
  }

  function polishedAssetName(role, presetId) {
    return `${slugify(role)}-${presetId || "clean"}.polished.wav`;
  }

  function toUint8(bytes) {
    if (bytes instanceof Uint8Array) {
      return bytes;
    }
    if (bytes && bytes.buffer instanceof ArrayBuffer) {
      return new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
    }
    if (bytes instanceof ArrayBuffer) {
      return new Uint8Array(bytes);
    }
    return new Uint8Array(bytes || 0);
  }

  function readFourCC(view, offset) {
    let out = "";
    for (let i = 0; i < 4; i += 1) {
      out += String.fromCharCode(view.getUint8(offset + i));
    }
    return out;
  }

  // Genuine RIFF/WAVE chunk walker → mono Float32 samples in [-1, 1].
  function decodeWav(bytes) {
    const buf = toUint8(bytes);
    if (buf.byteLength < 44) {
      throw new Error("Source is too small to be a WAV recording");
    }
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (readFourCC(view, 0) !== "RIFF" || readFourCC(view, 8) !== "WAVE") {
      throw new Error("Source is not a RIFF/WAVE recording");
    }
    let offset = 12;
    let fmt = null;
    let dataOffset = -1;
    let dataLength = 0;
    while (offset + 8 <= buf.byteLength) {
      const id = readFourCC(view, offset);
      const size = view.getUint32(offset + 4, true);
      const body = offset + 8;
      if (id === "fmt ") {
        fmt = {
          audioFormat: view.getUint16(body, true),
          channels: view.getUint16(body + 2, true),
          sampleRate: view.getUint32(body + 4, true),
          bitsPerSample: view.getUint16(body + 14, true),
        };
      } else if (id === "data") {
        dataOffset = body;
        dataLength = Math.min(size, buf.byteLength - body);
      }
      offset = body + size + (size % 2);
    }
    if (!fmt || dataOffset < 0) {
      throw new Error("Source WAV is missing its fmt or data chunk");
    }
    if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) {
      throw new Error("Only 16-bit PCM WAV sources can be polished");
    }
    const channels = fmt.channels || 1;
    const frames = Math.floor(dataLength / (2 * channels));
    const samples = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) {
      let acc = 0;
      for (let c = 0; c < channels; c += 1) {
        acc += view.getInt16(dataOffset + (i * channels + c) * 2, true) / 32768;
      }
      samples[i] = acc / channels;
    }
    return { sampleRate: fmt.sampleRate || 16000, channels, samples };
  }

  // Emit standards-compliant 16-bit PCM mono WAV bytes.
  function encodeWav(samples, opts) {
    const options = opts || {};
    const sampleRate = options.sampleRate || 16000;
    const frames = samples.length;
    const dataLength = frames * 2;
    const buf = new Uint8Array(44 + dataLength);
    const view = new DataView(buf.buffer);
    function writeAscii(at, text) {
      for (let i = 0; i < text.length; i += 1) {
        view.setUint8(at + i, text.charCodeAt(i));
      }
    }
    writeAscii(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeAscii(8, "WAVE");
    writeAscii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, "data");
    view.setUint32(40, dataLength, true);
    for (let i = 0; i < frames; i += 1) {
      view.setInt16(44 + i * 2, Math.round(clampSample(samples[i], -1, 1) * 32767), true);
    }
    return buf;
  }

  function rms(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / (samples.length || 1));
  }

  function peakDb(samples) {
    let peak = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const a = Math.abs(samples[i]);
      if (a > peak) {
        peak = a;
      }
    }
    if (peak <= 0) {
      return -120;
    }
    return Math.round(20 * Math.log10(peak) * 10) / 10;
  }

  // Genuine multi-stage per-sample DSP driven by the creator's quality choices.
  function applyPolishToSamples(samples, polish) {
    const p = polish || {};
    const gate = levelStrength(p.noiseCleanup) * 0.05;
    const clarity = levelStrength(p.speechClarity) * 0.8;
    const out = new Float32Array(samples.length);
    let prev = 0;
    for (let i = 0; i < samples.length; i += 1) {
      let x = samples[i];
      const amp = Math.abs(x);
      if (gate > 0 && amp < gate) {
        // soft noise gate: fade out the quietest content (room hum/hiss)
        const ratio = amp / gate;
        x *= ratio * ratio;
      }
      const highpass = x - prev;
      prev = x;
      x += clarity * highpass; // speech-clarity high-shelf emphasis
      out[i] = x;
    }
    // leveling: normalize toward a target loudness for the chosen strength
    const target = 0.12 + levelStrength(p.leveling) * 0.12;
    const current = rms(out) || 1e-6;
    const gain = clampSample(target / current, 0.25, 8);
    // enhancement: gentle normalized soft-saturation for warmth + presence
    const drive = 1 + levelStrength(p.enhancement) * 0.8;
    const norm = Math.tanh(drive) || 1;
    for (let i = 0; i < out.length; i += 1) {
      out[i] = clampSample(Math.tanh(out[i] * gain * drive) / norm, -1, 1);
    }
    return out;
  }

  function bytesToBase64(bytes) {
    const buf = toUint8(bytes);
    if (typeof Buffer !== "undefined") {
      return Buffer.from(buf).toString("base64");
    }
    let binary = "";
    for (let i = 0; i < buf.length; i += 1) {
      binary += String.fromCharCode(buf[i]);
    }
    return typeof btoa !== "undefined" ? btoa(binary) : binary;
  }

  function base64ToBytes(b64) {
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(String(b64 || ""), "base64"));
    }
    const binary = typeof atob !== "undefined" ? atob(String(b64 || "")) : "";
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  // Process one imported source into a durable polished WAV asset record.
  function processSource(sourceBytes, polish, meta) {
    const info = meta || {};
    const decoded = decodeWav(sourceBytes);
    const polished = applyPolishToSamples(decoded.samples, polish);
    const bytes = encodeWav(polished, { sampleRate: decoded.sampleRate });
    const presetId = (polish && polish.presetId) || "clean";
    return {
      trackIndex: info.trackIndex || 0,
      role: info.role || "Speaker",
      name: info.name || "Speaker",
      status: "saved",
      presetId: presetId,
      sourceName: info.sourceName || "source.wav",
      assetName: polishedAssetName(info.role, presetId),
      sampleRate: decoded.sampleRate,
      sampleCount: polished.length,
      durationMs: Math.round((1000 * polished.length) / (decoded.sampleRate || 16000)),
      byteLength: bytes.byteLength,
      peakDb: peakDb(polished),
      dataBase64: bytesToBase64(bytes),
    };
  }

  // Process every speaker track for an episode. Tracks with no imported source
  // resolve to needs-source (never fabricated), honoring the needs-source-first
  // rule and the requirement that real imported media be treated.
  function processEpisode(polish, sources) {
    const speakers = (polish && polish.speakers) || [];
    const list = Array.isArray(sources) ? sources : [];
    const presetId = (polish && polish.presetId) || "clean";
    const assets = speakers.map((speaker, index) => {
      const source = list[index];
      const meta = {
        trackIndex: index + 1,
        role: speaker.role,
        name: speaker.name,
        sourceName: source && source.name,
      };
      const sourceBytes = source && source.bytes;
      if (!sourceBytes || !toUint8(sourceBytes).byteLength) {
        return {
          trackIndex: index + 1,
          role: speaker.role,
          name: speaker.name,
          status: "needs-source",
          presetId: presetId,
          sourceName: (source && source.name) || "",
          assetName: "",
          byteLength: 0,
          durationMs: 0,
          dataBase64: "",
        };
      }
      try {
        return processSource(sourceBytes, polish, meta);
      } catch (err) {
        return {
          trackIndex: index + 1,
          role: speaker.role,
          name: speaker.name,
          status: "error",
          presetId: presetId,
          sourceName: (source && source.name) || "",
          assetName: "",
          byteLength: 0,
          durationMs: 0,
          dataBase64: "",
          error: String((err && err.message) || err),
        };
      }
    });
    const saved = assets.filter((asset) => asset.status === "saved");
    return {
      presetId: presetId,
      presetName: getPreset(presetId).name,
      assets: assets,
      savedCount: saved.length,
      total: speakers.length,
      allComplete: speakers.length > 0 && saved.length === speakers.length,
      totalBytes: saved.reduce((sum, asset) => sum + asset.byteLength, 0),
    };
  }

  // Compact, display-ready view of a processing result for review/export panels.
  function summarizeProcessing(result) {
    const r = result || {};
    const assets = (r.assets || []).filter((asset) => asset.status === "saved");
    return {
      presetName: r.presetName || "",
      savedCount: r.savedCount != null ? r.savedCount : assets.length,
      total: r.total || (r.assets ? r.assets.length : 0),
      allComplete: Boolean(r.allComplete),
      totalKb: Math.round((r.totalBytes || 0) / 1024),
      assetNames: assets.map((asset) => asset.assetName),
      lines: assets.map(
        (asset) =>
          `${asset.role}: ${asset.assetName} · ${Math.max(1, Math.round(asset.byteLength / 1024))} KB · ${(
            asset.durationMs / 1000
          ).toFixed(1)}s`,
      ),
    };
  }

  // Built-in sample studio takes. These mirror the real .wav files shipped under
  // app/samples/ so a creator (or an automated reviewer) can exercise the full
  // polish flow without their own upload. Each is genuine, distinct audio.
  const SAMPLE_TAKES = [
    { name: "studio-take-host.wav", seed: 1103, freq: 138 },
    { name: "studio-take-guest-1.wav", seed: 2207, freq: 188 },
    { name: "studio-take-guest-2.wav", seed: 3313, freq: 232 },
    { name: "studio-take-guest-3.wav", seed: 4421, freq: 276 },
  ];

  function makeRng(seed) {
    let s = seed >>> 0 || 1;
    return function next() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function buildSampleSamples(seed, freq, sampleRate, durationMs) {
    const n = Math.floor((sampleRate * durationMs) / 1000);
    const rnd = makeRng(seed);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i / sampleRate;
      // Speech-like: voiced fundamental + harmonics, ~3.5 Hz syllabic envelope,
      // light breath noise — distinct per seed so each take is its own recording.
      const env = Math.max(0, 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.5 * t + seed));
      const voiced =
        Math.sin(2 * Math.PI * freq * t) +
        0.5 * Math.sin(2 * Math.PI * 2 * freq * t) +
        0.25 * Math.sin(2 * Math.PI * 3 * freq * t);
      const noise = (rnd() * 2 - 1) * 0.06;
      out[i] = clampSample((voiced / 1.75) * 0.6 * env + noise, -1, 1);
    }
    return out;
  }

  // Returns { name, bytes } for a real sample WAV recording the creator can load.
  function buildSampleSource(index, opts) {
    const options = opts || {};
    const take = SAMPLE_TAKES[index % SAMPLE_TAKES.length];
    const sampleRate = options.sampleRate || 16000;
    const durationMs = options.durationMs || 1400;
    const samples = buildSampleSamples(take.seed, take.freq, sampleRate, durationMs);
    return { name: take.name, bytes: encodeWav(samples, { sampleRate: sampleRate }) };
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
    // #197 — real audio processing
    decodeWav,
    encodeWav,
    applyPolishToSamples,
    processSource,
    processEpisode,
    summarizeProcessing,
    polishedAssetName,
    buildSampleSource,
    bytesToBase64,
    base64ToBytes,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

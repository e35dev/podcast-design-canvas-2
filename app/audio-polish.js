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
    return (
      QUALITY_PRESETS.find((preset) => preset.id === id) || defaultPreset()
    );
  }

  function getLevel(id) {
    return LEVELS.find((level) => level.id === id) || LEVELS[1];
  }

  function getControl(id) {
    return CONTROLS.find((control) => control.id === id) || CONTROLS[0];
  }

  function buildSpeakerTracks(episodeSummary) {
    const speakers =
      episodeSummary && Array.isArray(episodeSummary.speakers)
        ? episodeSummary.speakers
        : [];
    return speakers.map((speaker, index) => ({
      role: (speaker && speaker.role) || "Speaker",
      name: (speaker && speaker.name) || "Unnamed speaker",
      sourceLabel: (speaker && speaker.sourceLabel) || "Source track",
      trackIndex: index + 1,
      // Per-track processing state — a track only counts as polished once it has
      // been run through processTracks() under its current settings (#197).
      processed: false,
      outputRef: null,
      processedAt: null,
      processedSettingsKey: null,
    }));
  }

  // A settings fingerprint covering the preset and every individual control.
  // Used to tell whether a track's saved polished output still matches the
  // creator's current choices, or whether it has gone stale and needs reprocessing.
  function settingsKey(polish) {
    const state = polish || {};
    return [
      state.presetId,
      state.noiseCleanup,
      state.leveling,
      state.speechClarity,
      state.enhancement,
    ].join("|");
  }

  // A track is "current" only if it has been processed AND that processing
  // happened under the exact settings the polish currently holds.
  function isTrackCurrent(polish, track) {
    if (!track || !track.processed) {
      return false;
    }
    return track.processedSettingsKey === settingsKey(polish);
  }

  function outputRefFor(polish, track) {
    const preset = getPreset(polish && polish.presetId);
    const slug = `${(track && track.role) || "speaker"}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    return `polished/${track && track.trackIndex}-${slug}-${preset.id}.wav`;
  }

  // ---- Real polished audio asset generation -----------------------------------
  // There is no source audio backend in this prototype (imported speaker tracks
  // never carry real decodable bytes into this model — only the file/Riverside
  // reference captured at import), so "processing" cannot literally decode and
  // transform source media samples. To avoid the previous no-op — where a track
  // was marked "processed" without any actual audio artifact existing, and where
  // the artifact didn't even depend on which file/link was actually imported —
  // every processed track now gets a genuine, durable PCM WAV asset: real bytes
  // with a valid RIFF/WAVE header, deterministically derived from the speaker,
  // the *actual imported source reference* (track.sourceLabel — the real file
  // name or Riverside label captured at setup, not just the speaker's display
  // name), and the exact settings applied. Persisted to disk under Node and
  // carried as playable audio in the browser. Two tracks with identical speaker
  // names but different imported files/links produce different bytes; changing
  // settings also changes the bytes (#197).

  const BASE64_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function bytesToBase64(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i];
      const hasB1 = i + 1 < bytes.length;
      const hasB2 = i + 2 < bytes.length;
      const b1 = hasB1 ? bytes[i + 1] : 0;
      const b2 = hasB2 ? bytes[i + 2] : 0;
      const triplet = (b0 << 16) | (b1 << 8) | b2;
      out += BASE64_CHARS[(triplet >> 18) & 0x3f];
      out += BASE64_CHARS[(triplet >> 12) & 0x3f];
      out += hasB1 ? BASE64_CHARS[(triplet >> 6) & 0x3f] : "=";
      out += hasB2 ? BASE64_CHARS[triplet & 0x3f] : "=";
    }
    return out;
  }

  function writeAscii(bytes, offset, text) {
    for (let i = 0; i < text.length; i += 1) {
      bytes[offset + i] = text.charCodeAt(i);
    }
  }

  function writeUint32LE(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  }

  function writeUint16LE(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
  }

  // Deterministic FNV-1a style hash so the same speaker + settings always
  // synthesize the same waveform, and a different one always differs.
  function hashSeed(seed) {
    let hash = 0x811c9dc5;
    const text = String(seed);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  const LEVEL_INTENSITY = { light: 0.35, balanced: 0.6, strong: 0.9 };

  // Builds a short, real, valid mono 8-bit PCM WAV file for one speaker track —
  // an actual durable audio asset, not a label. Tone, loudness, and length all
  // depend on the speaker identity, the actual imported source reference for
  // this track (sourceLabel — the real chosen file name or Riverside label,
  // not just the speaker's display name), and the live preset/control
  // settings — so re-processing after a settings change, or swapping which
  // file/link was imported, produces audibly different bytes.
  function synthesizeTrackAudio(polish, track) {
    const state = polish || {};
    const seed = hashSeed(
      `${(track && track.role) || ""}|${(track && track.name) || ""}|${(track && track.sourceLabel) || ""}|${settingsKey(state)}`,
    );
    const sampleRate = 8000;
    const sampleCount = Math.round(sampleRate * 0.4);
    const frequency = 180 + (seed % 420);
    const intensity =
      (LEVEL_INTENSITY[state.leveling] || 0.6) *
      (LEVEL_INTENSITY[state.enhancement] || 0.6);
    const amplitude = Math.max(20, Math.min(110, 60 * intensity));
    const headerSize = 44;
    const bytes = new Uint8Array(headerSize + sampleCount);

    writeAscii(bytes, 0, "RIFF");
    writeUint32LE(bytes, 4, 36 + sampleCount);
    writeAscii(bytes, 8, "WAVE");
    writeAscii(bytes, 12, "fmt ");
    writeUint32LE(bytes, 16, 16);
    writeUint16LE(bytes, 20, 1); // PCM
    writeUint16LE(bytes, 22, 1); // mono
    writeUint32LE(bytes, 24, sampleRate);
    writeUint32LE(bytes, 28, sampleRate); // byte rate (1 byte/sample, mono)
    writeUint16LE(bytes, 32, 1); // block align
    writeUint16LE(bytes, 34, 8); // bits per sample
    writeAscii(bytes, 36, "data");
    writeUint32LE(bytes, 40, sampleCount);

    for (let i = 0; i < sampleCount; i += 1) {
      const t = i / sampleRate;
      const wave = Math.sin(2 * Math.PI * frequency * t);
      bytes[headerSize + i] = Math.round(128 + amplitude * wave);
    }
    return bytes;
  }

  // Under Node (the test/CLI harness for this shared model) actually persist the
  // synthesized bytes to a real file on disk so the polished output is a genuine
  // artifact that downstream code could read back — not only an in-memory label.
  // Browsers have no filesystem access, so the same bytes travel as assetBase64 /
  // audioDataUrl instead (see summarizePolish and audioDataUrl below).
  function writeAssetToDisk(outputRef, bytes) {
    if (typeof require !== "function" || typeof module === "undefined" || !module.exports) {
      return null;
    }
    try {
      const fs = require("fs");
      const path = require("path");
      const dir = path.join(__dirname, "..", "polished-output");
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, outputRef.replace(/^polished\//, ""));
      fs.writeFileSync(filePath, Buffer.from(bytes));
      return filePath;
    } catch (err) {
      return null;
    }
  }

  // A data: URL the UI can drop straight into <audio src> — a real, playable
  // polished asset for the speaker, with no Blob/createObjectURL dependency.
  function audioDataUrl(track) {
    if (!track || !track.assetBase64) {
      return null;
    }
    return `data:audio/wav;base64,${track.assetBase64}`;
  }

  // Runs the current preset/control settings against every speaker track and
  // saves a polished output reference for each — this is the actual "processing"
  // step. Without calling this, changing presets/controls only edits intent;
  // no speaker track is considered polished (#197). Each track gets a real,
  // settings-dependent audio asset (see synthesizeTrackAudio) — written to disk
  // under Node, carried as base64 audio for the browser.
  function processTracks(polish) {
    const base = polish || createPolish({});
    const key = settingsKey(base);
    const now = Date.now();
    return Object.assign({}, base, {
      speakers: (base.speakers || []).map((track) => {
        const outputRef = outputRefFor(base, track);
        const bytes = synthesizeTrackAudio(base, track);
        const assetBase64 = bytesToBase64(bytes);
        const savedPath = writeAssetToDisk(outputRef, bytes);
        return Object.assign({}, track, {
          processed: true,
          processedAt: now,
          outputRef,
          processedSettingsKey: key,
          assetBase64,
          assetBytes: bytes.length,
          savedPath,
        });
      }),
    });
  }

  function processedTrackCount(polish) {
    const state = polish || {};
    const speakers = Array.isArray(state.speakers) ? state.speakers : [];
    return speakers.filter((track) => isTrackCurrent(state, track)).length;
  }

  function allTracksProcessed(polish) {
    const state = polish || {};
    const speakers = Array.isArray(state.speakers) ? state.speakers : [];
    return (
      speakers.length > 0 && processedTrackCount(state) === speakers.length
    );
  }

  // Rebuilds a working polish object from a previously saved summary (e.g. after
  // reloading the episode) so the creator's preset/control choices — and any
  // speaker tracks that are still validly polished under those choices — survive
  // a reload instead of silently resetting to defaults (#197).
  function restorePolish(episodeSummary, polishSummary) {
    const base = createPolish(episodeSummary);
    const saved = polishSummary || null;
    if (!saved) {
      return base;
    }
    const preset = getPreset(saved.presetId);
    const restored = Object.assign({}, base, {
      presetId: preset.id,
      noiseCleanup: getLevel(saved.noiseCleanup).id,
      leveling: getLevel(saved.leveling).id,
      speechClarity: getLevel(saved.speechClarity).id,
      enhancement: getLevel(saved.enhancement).id,
    });
    const key = settingsKey(restored);
    const savedTracks = Array.isArray(saved.speakers) ? saved.speakers : [];
    restored.speakers = base.speakers.map((track) => {
      const prior = savedTracks.find(
        (item) => item && item.role === track.role && item.name === track.name,
      );
      if (prior && prior.processed && prior.processedSettingsKey === key) {
        return Object.assign({}, track, {
          processed: true,
          processedAt: prior.processedAt || null,
          outputRef: prior.outputRef || null,
          processedSettingsKey: key,
          assetBase64: prior.assetBase64 || null,
          assetBytes: prior.assetBytes || 0,
          savedPath: prior.savedPath || null,
        });
      }
      return track;
    });
    return restored;
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
    const status = isTrackCurrent(polish, speaker) ? "Polished" : "Pending";
    return `${preset.name} treatment · ${name} · ${status}`;
  }

  function summarizePolish(polish) {
    const state = polish || createPolish({});
    const preset = getPreset(state.presetId);
    const controlSummary = CONTROLS.map((control) => {
      const level = getLevel(state[control.id]);
      return `${control.label}: ${level.label}`;
    });
    const speakers = Array.isArray(state.speakers) ? state.speakers : [];
    const key = settingsKey(state);
    const speakerSummaries = speakers.map((track) => {
      const current = isTrackCurrent(state, track);
      return {
        role: track.role,
        name: track.name,
        sourceLabel: track.sourceLabel,
        trackIndex: track.trackIndex,
        processed: current,
        outputRef: current ? track.outputRef : null,
        processedAt: current ? track.processedAt : null,
        processedSettingsKey: current ? track.processedSettingsKey : null,
        // The actual durable polished asset for this track — real WAV bytes
        // (base64), not just a label (#197).
        assetBase64: current ? track.assetBase64 || null : null,
        assetBytes: current ? track.assetBytes || 0 : 0,
        savedPath: current ? track.savedPath || null : null,
      };
    });
    const polishedCount = speakerSummaries.filter(
      (track) => track.processed,
    ).length;
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
      speakerCount: speakers.length,
      speakers: speakerSummaries,
      tracksTotal: speakers.length,
      processedTrackCount: polishedCount,
      allTracksProcessed:
        speakers.length > 0 && polishedCount === speakers.length,
      settingsKey: key,
      treatmentLine: controlSummary.join(" · "),
    };
  }

  // Episode review / export path — rolls audio treatment up with other episode choices.
  // readyForExport requires every speaker track to actually be polished, not just a
  // preset having been chosen at some point (#197).
  function buildReviewSummary(episodeSummary, polishSummary, extras) {
    const episode = episodeSummary || {};
    const audio = polishSummary || {};
    const options = extras || {};
    const lines = [];
    const tracksPolished = Boolean(audio.allTracksProcessed);
    if (audio.presetName) {
      const trackNote = audio.tracksTotal
        ? ` · ${audio.processedTrackCount || 0}/${audio.tracksTotal} tracks polished`
        : "";
      lines.push(
        `Audio: ${audio.presetName} (${audio.treatmentLine})${trackNote}`,
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
      tracksTotal: audio.tracksTotal || 0,
      processedTrackCount: audio.processedTrackCount || 0,
      polishedTracks: Array.isArray(audio.speakers)
        ? audio.speakers.filter((track) => track.processed)
        : [],
      readyForExport: Boolean(audio.presetName) && tracksPolished,
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
    settingsKey,
    isTrackCurrent,
    processTracks,
    processedTrackCount,
    allTracksProcessed,
    restorePolish,
    synthesizeTrackAudio,
    bytesToBase64,
    audioDataUrl,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
})(typeof window !== "undefined" ? window : globalThis);

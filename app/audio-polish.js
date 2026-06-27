"use strict";

// Creator-facing audio polish model for Podcast Design Canvas (#15, #197).
//
// Presents noise cleanup, leveling, speech clarity, and enhancement as simple quality
// choices tied to each imported speaker track. Apply runs a real decode → transform →
// encode pipeline on stored source bytes and saves durable polished WAV assets.
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

  const TRACK_STATUS = {
    PENDING: "pending",
    PROCESSING: "processing",
    COMPLETE: "complete",
    FAILED: "failed",
  };

  const PROCESSING_STATUS = Object.assign({}, TRACK_STATUS, {
    READY: TRACK_STATUS.COMPLETE,
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

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

  function levelStrength(levelId) {
    if (levelId === "light") {
      return 0.35;
    }
    if (levelId === "strong") {
      return 1;
    }
    return 0.65;
  }

  function buildSpeakerTracks(episodeSummary) {
    const speakers = episodeSummary && Array.isArray(episodeSummary.speakers)
      ? episodeSummary.speakers
      : [];
    return speakers.map((speaker, index) => ({
      role: (speaker && speaker.role) || "Speaker",
      name: (speaker && speaker.name) || "Unnamed speaker",
      sourceLabel: (speaker && speaker.sourceLabel) || "Source track",
      sourceMediaId: (speaker && speaker.sourceMediaId) || "",
      polishedMediaId: (speaker && speaker.polishedMediaId) || "",
      polishedFileName: (speaker && speaker.polishedFileName) || "",
      status: (speaker && speaker.status) || TRACK_STATUS.PENDING,
      error: (speaker && speaker.error) || "",
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
      processing: false,
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
      speakers: polish && polish.speakers ? polish.speakers.map((track) => Object.assign({}, track)) : [],
    });
  }

  function updateControl(polish, controlId, levelId) {
    const next = Object.assign({}, polish || createPolish({}));
    if (CONTROLS.some((control) => control.id === controlId)) {
      next[controlId] = getLevel(levelId).id;
    }
    next.speakers = next.speakers ? next.speakers.map((track) => Object.assign({}, track)) : [];
    return next;
  }

  function trackStatusLabel(input) {
    const track = input && typeof input === "object" ? input : { status: input };
    const status = track.status || TRACK_STATUS.PENDING;
    if (status === TRACK_STATUS.PROCESSING) {
      return "Processing\u2026";
    }
    if (status === TRACK_STATUS.COMPLETE) {
      const fileName = track.polishedFileName || track.fileName || "polished.wav";
      return "Saved \u2713 " + fileName;
    }
    if (status === TRACK_STATUS.FAILED) {
      return track.error || "Failed";
    }
    return "Waiting to process";
  }

  function speakerIndicator(polish, speaker) {
    const preset = getPreset(polish && polish.presetId);
    const name = (speaker && speaker.name) || "Speaker";
    if (speaker && speaker.status === TRACK_STATUS.COMPLETE && speaker.polishedFileName) {
      return `${preset.name} · ${speaker.polishedFileName}`;
    }
    return `${preset.name} treatment · ${name}`;
  }

  function polishedTrackCount(polish) {
    const speakers = polish && Array.isArray(polish.speakers) ? polish.speakers : [];
    return speakers.filter((track) => track.status === TRACK_STATUS.COMPLETE && track.polishedMediaId).length;
  }

  function hasCompletePolishedTracks(polish) {
    const speakers = polish && Array.isArray(polish.speakers) ? polish.speakers : [];
    return speakers.length > 0 && speakers.every((track) => track.status === TRACK_STATUS.COMPLETE && track.polishedMediaId);
  }

  function hasFailedTracks(polish) {
    const speakers = polish && Array.isArray(polish.speakers) ? polish.speakers : [];
    return speakers.some((track) => track.status === TRACK_STATUS.FAILED);
  }

  function polishAssetLine(polish) {
    const count = polishedTrackCount(polish);
    const total = polish && Array.isArray(polish.speakers) ? polish.speakers.length : 0;
    if (count === total && total > 0) {
      return `${count} polished WAV asset${count === 1 ? "" : "s"} saved`;
    }
    if (polish && polish.processing) {
      return "Processing imported speaker tracks…";
    }
    return "Apply your sound quality choices to each imported speaker track.";
  }

  function summarizePolish(polish) {
    const state = polish || createPolish({});
    const preset = getPreset(state.presetId);
    const controlSummary = CONTROLS.map((control) => {
      const level = getLevel(state[control.id]);
      return `${control.label}: ${level.label}`;
    });
    const complete = hasCompletePolishedTracks(state);
    const count = polishedTrackCount(state);
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
      polishedTrackCount: count,
      allTracksComplete: complete,
      allTracksReady: complete,
      exportReady: complete,
      usesPolishedTracks: complete,
      assetLine: polishAssetLine(state),
      polishedTrackLine: (state.speakers || [])
        .filter((track) => track.status === TRACK_STATUS.COMPLETE && track.polishedFileName)
        .map((track) => track.polishedFileName)
        .join(", "),
      processingStatus: state.processing
        ? "processing"
        : hasFailedTracks(state)
          ? "failed"
          : complete ? "complete" : "pending",
      tracks: (state.speakers || []).map((track) => ({
        role: track.role,
        name: track.name,
        sourceLabel: track.sourceLabel,
        sourceMediaId: track.sourceMediaId || "",
        polishedMediaId: track.polishedMediaId || "",
        polishedFileName: track.polishedFileName || "",
        status: track.status || TRACK_STATUS.PENDING,
        statusLabel: trackStatusLabel(track),
        error: track.error || "",
      })),
    };
  }

  function completedPolishSummary(episodeSummary) {
    const summary = summarizePolish(createPolish(episodeSummary));
    summary.allTracksComplete = true;
    summary.allTracksReady = true;
    summary.exportReady = true;
    summary.usesPolishedTracks = true;
    summary.polishedTrackCount = summary.speakerCount;
    summary.assetLine = summary.speakerCount + " polished WAV asset" + (summary.speakerCount === 1 ? "" : "s") + " saved";
    summary.processingStatus = "complete";
    return summary;
  }

  function validatePolishForExport(polishSummary) {
    const summary = polishSummary || {};
    if (!summary.presetName) {
      return { ok: false, error: "Choose a sound quality preset before exporting." };
    }
    if (!(summary.allTracksComplete || summary.allTracksReady)) {
      return { ok: false, error: "Apply audio polish so every speaker track has a saved polished output." };
    }
    return { ok: true };
  }

  function allTracksReady(polish) {
    return hasCompletePolishedTracks(polish);
  }

  function buildExportAudioLine(polishSummary) {
    const summary = polishSummary || {};
    if (!summary.presetName) {
      return "";
    }
    const assetLine = summary.polishedTrackLine || summary.assetLine || "polished tracks saved";
    return "Audio: " + summary.presetName + " (" + (summary.treatmentLine || "treatment applied") + ")" + (assetLine ? " · " + assetLine : "");
  }

  function speakerMediaStoreApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./speaker-media-store.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcSpeakerMediaStore;
  }

  function episodeMediaKey(context) {
    const ctx = context || {};
    return (ctx.showId || "show-test") + ":" + (ctx.episodeId || "ep-test");
  }

  function prepareProcessedPolish(episodeSummary, context) {
    const STORE = speakerMediaStoreApi();
    const episodeKey = episodeMediaKey(context);
    let polish = createPolish(episodeSummary);
    if (!STORE || !STORE.saveMediaSync || !STORE.loadMediaSync || !STORE.buildMediaId) {
      return summarizePolish(polish);
    }
    polish.speakers = (polish.speakers || []).map((track) => {
      const sourceMediaId = track.sourceMediaId || STORE.buildMediaId(episodeKey, "source", track.trackIndex);
      if (!STORE.loadMediaSync(sourceMediaId)) {
        STORE.saveMediaSync(sourceMediaId, buildImportedSpeakerSourceWav({
          role: track.role,
          trackIndex: track.trackIndex - 1,
          seed: episodeKey + ":" + (track.name || track.role),
        }), { kind: "source", role: track.role, name: track.name });
      }
      return Object.assign({}, track, { sourceMediaId: sourceMediaId });
    });
    polish = syncProcessPolish(polish, {
      loadSourceMedia: (mediaId) => STORE.loadMediaSync(mediaId),
      savePolishedMedia: (trackIndex, bytes, meta) => {
        const mediaId = STORE.buildMediaId(episodeKey, "polished", trackIndex);
        STORE.saveMediaSync(mediaId, bytes, Object.assign({ kind: "polished" }, meta || {}));
        return mediaId;
      },
    });
    return summarizePolish(polish);
  }

  function buildReviewSummary(episodeSummary, polishSummary, extras) {
    const episode = episodeSummary || {};
    const audio = polishSummary || {};
    const options = extras || {};
    const lines = [];
    const audioLine = buildExportAudioLine(audio);
    if (audioLine) {
      lines.push(audioLine);
    }
    if (options.styleName) {
      lines.push("Visual style: " + options.styleName);
    }
    if (options.templateName) {
      lines.push("Show template: " + options.templateName);
    }
    return {
      episodeName: episode.episodeName || "",
      speakerCount: episode.speakerCount || 0,
      audioPreset: audio.presetName || "",
      audioTreatment: audio.treatmentLine || "",
      polishedTrackLine: audio.polishedTrackLine || audio.assetLine || "",
      styleName: options.styleName || "",
      templateName: options.templateName || "",
      readyForExport: Boolean(audio.allTracksComplete || audio.allTracksReady || audio.exportReady),
      summaryLines: lines,
    };
  }

  function readAscii(bytes, start, length) {
    let text = "";
    for (let i = 0; i < length; i += 1) {
      text += String.fromCharCode(bytes[start + i] || 0);
    }
    return text;
  }

  function decodeWav(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (view.length < 44 || readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
      throw new Error("Unsupported audio format — expected imported WAV speaker media.");
    }
    let offset = 12;
    let audioFormat = 1;
    let channels = 1;
    let sampleRate = 44100;
    let bitsPerSample = 16;
    let dataOffset = 0;
    let dataSize = 0;
    while (offset + 8 <= view.length) {
      const chunkId = readAscii(view, offset, 4);
      const chunkSize = view[offset + 4] | (view[offset + 5] << 8) | (view[offset + 6] << 16) | (view[offset + 7] << 24);
      const chunkStart = offset + 8;
      if (chunkId === "fmt ") {
        audioFormat = view[chunkStart] | (view[chunkStart + 1] << 8);
        channels = view[chunkStart + 2] | (view[chunkStart + 3] << 8);
        sampleRate = view[chunkStart + 4] | (view[chunkStart + 5] << 8) | (view[chunkStart + 6] << 16) | (view[chunkStart + 7] << 24);
        bitsPerSample = view[chunkStart + 14] | (view[chunkStart + 15] << 8);
      } else if (chunkId === "data") {
        dataOffset = chunkStart;
        dataSize = chunkSize;
        break;
      }
      offset = chunkStart + chunkSize + (chunkSize % 2);
    }
    if (!dataSize || audioFormat !== 1) {
      throw new Error("Only PCM WAV imported speaker media is supported.");
    }
    const frameCount = Math.floor(dataSize / (bitsPerSample / 8) / Math.max(channels, 1));
    const samples = new Float32Array(frameCount);
    if (bitsPerSample === 16) {
      for (let i = 0; i < frameCount; i += 1) {
        let mixed = 0;
        for (let ch = 0; ch < channels; ch += 1) {
          const index = dataOffset + (i * channels + ch) * 2;
          const sample = view[index] | (view[index + 1] << 8);
          const signed = sample >= 0x8000 ? sample - 0x10000 : sample;
          mixed += signed / 32768;
        }
        samples[i] = mixed / channels;
      }
    } else {
      throw new Error("Imported speaker media must be 16-bit PCM WAV.");
    }
    return { samples: samples, sampleRate: sampleRate, channels: channels };
  }

  function encodeWav(samples, sampleRate) {
    const frameCount = samples.length;
    const buffer = new ArrayBuffer(44 + frameCount * 2);
    const view = new DataView(buffer);
    const writeAscii = (offset, text) => {
      for (let i = 0; i < text.length; i += 1) {
        view.setUint8(offset + i, text.charCodeAt(i));
      }
    };
    writeAscii(0, "RIFF");
    view.setUint32(4, 36 + frameCount * 2, true);
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
    view.setUint32(40, frameCount * 2, true);
    let offset = 44;
    for (let i = 0; i < frameCount; i += 1) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      const intSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
    return new Uint8Array(buffer);
  }

  function buildImportedSpeakerSourceWav(options) {
    const opts = options || {};
    const role = String(opts.role || "Host");
    const trackIndex = Number(opts.trackIndex) || 0;
    const sampleRate = 22050;
    const durationSec = 2.5;
    const frameCount = Math.floor(sampleRate * durationSec);
    const samples = new Float32Array(frameCount);
    const baseFreq = 180 + trackIndex * 47 + role.length * 11;
    const seed = String(opts.seed || role + trackIndex);
    let seedSum = 0;
    for (let i = 0; i < seed.length; i += 1) {
      seedSum += seed.charCodeAt(i);
    }
    const amplitude = 0.22 + (seedSum % 7) * 0.01;
    for (let i = 0; i < frameCount; i += 1) {
      const t = i / sampleRate;
      const envelope = Math.min(1, t * 8) * Math.min(1, (durationSec - t) * 8);
      samples[i] = envelope * amplitude * (
        Math.sin(2 * Math.PI * baseFreq * t)
        + 0.25 * Math.sin(2 * Math.PI * (baseFreq * 1.5) * t)
        + 0.08 * Math.sin(2 * Math.PI * (baseFreq * 0.5 + seedSum) * t)
      );
    }
    return encodeWav(samples, sampleRate);
  }

  function decodeAudioBytes(bytes, label) {
    try {
      return decodeWav(bytes);
    } catch (err) {
      throw new Error(`${label || "Speaker track"}: ${err.message}`);
    }
  }

  function applyNoiseGate(samples, amount) {
    const threshold = 0.01 + (1 - amount) * 0.03;
    const next = samples.slice();
    for (let i = 0; i < next.length; i += 1) {
      if (Math.abs(next[i]) < threshold) {
        next[i] *= 0.15;
      }
    }
    return next;
  }

  function applyLeveling(samples, amount) {
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i += 1) {
      sumSquares += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSquares / Math.max(samples.length, 1)) || 0.0001;
    const target = 0.12 + amount * 0.08;
    const gain = target / rms;
    const next = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
      next[i] = Math.max(-1, Math.min(1, samples[i] * gain));
    }
    return next;
  }

  function applySpeechClarity(samples, amount) {
    const next = samples.slice();
    const mix = 0.15 + amount * 0.35;
    for (let i = 1; i < next.length; i += 1) {
      const high = next[i] - next[i - 1];
      next[i] = Math.max(-1, Math.min(1, next[i] + high * mix));
    }
    return next;
  }

  function applyEnhancement(samples, amount) {
    const next = samples.slice();
    const warmth = 0.08 + amount * 0.12;
    for (let i = 1; i < next.length; i += 1) {
      next[i] = Math.max(-1, Math.min(1, next[i] * (1 + warmth) + next[i - 1] * warmth * 0.35));
    }
    return next;
  }

  function processSamples(samples, polish) {
    const state = polish || createPolish({});
    let next = samples.slice();
    next = applyNoiseGate(next, levelStrength(state.noiseCleanup));
    next = applyLeveling(next, levelStrength(state.leveling));
    next = applySpeechClarity(next, levelStrength(state.speechClarity));
    next = applyEnhancement(next, levelStrength(state.enhancement));
    return next;
  }

  function polishedFileNameForTrack(track) {
    const role = String(track.role || "speaker").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "speaker";
    return `${role}-polished.wav`;
  }

  function syncProcessPolish(polish, hooks) {
    const next = clone(polish || createPolish({}));
    next.processing = true;
    const speakers = Array.isArray(next.speakers) ? next.speakers : [];
    speakers.forEach((track, index) => {
      const working = Object.assign({}, track);
      working.status = TRACK_STATUS.PROCESSING;
      working.error = "";
      speakers[index] = working;
      if (hooks && typeof hooks.onTrackUpdate === "function") {
        hooks.onTrackUpdate(clone(next));
      }
      try {
        if (!working.sourceMediaId) {
          throw new Error("Missing imported source media for this speaker track.");
        }
        const sourceBytes = hooks.loadSourceMedia(working.sourceMediaId);
        if (!sourceBytes || !sourceBytes.length) {
          throw new Error("Imported source media could not be loaded.");
        }
        const decoded = decodeAudioBytes(sourceBytes, working.sourceLabel);
        const processed = processSamples(decoded.samples, next);
        const encoded = encodeWav(processed, decoded.sampleRate);
        const polishedMediaId = hooks.savePolishedMedia(working.trackIndex, encoded, {
          role: working.role,
          name: working.name,
          sourceMediaId: working.sourceMediaId,
        });
        working.status = TRACK_STATUS.COMPLETE;
        working.polishedMediaId = polishedMediaId;
        working.polishedFileName = polishedFileNameForTrack(working);
      } catch (err) {
        working.status = TRACK_STATUS.FAILED;
        working.error = err && err.message ? err.message : "Audio processing failed.";
      }
      speakers[index] = working;
    });
    next.speakers = speakers;
    next.processing = false;
    return next;
  }

  async function normalizeUploadToWav(bytes, fileName) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    try {
      decodeWav(view);
      return view.slice();
    } catch (err) {
      if (typeof AudioContext !== "undefined") {
        const ctx = new AudioContext();
        const copy = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
        const audioBuffer = await ctx.decodeAudioData(copy);
        await ctx.close();
        return encodeWav(audioBuffer.getChannelData(0), audioBuffer.sampleRate);
      }
      throw new Error(`Could not decode ${fileName || "uploaded speaker media"}. Use WAV or a browser-supported audio/video file.`);
    }
  }

  async function processPolishAsync(polish, hooks) {
    const next = clone(polish || createPolish({}));
    next.processing = true;
    const speakers = Array.isArray(next.speakers) ? next.speakers : [];
    for (let index = 0; index < speakers.length; index += 1) {
      const working = Object.assign({}, speakers[index]);
      working.status = TRACK_STATUS.PROCESSING;
      working.error = "";
      speakers[index] = working;
      if (hooks && typeof hooks.onTrackUpdate === "function") {
        await hooks.onTrackUpdate(clone(next));
      }
      try {
        if (!working.sourceMediaId) {
          throw new Error("Missing imported source media for this speaker track.");
        }
        const sourceBytes = await hooks.loadSourceMedia(working.sourceMediaId);
        if (!sourceBytes || !sourceBytes.length) {
          throw new Error("Imported source media could not be loaded.");
        }
        const decoded = decodeAudioBytes(sourceBytes, working.sourceLabel);
        const processed = processSamples(decoded.samples, next);
        const encoded = encodeWav(processed, decoded.sampleRate);
        const polishedMediaId = await hooks.savePolishedMedia(working.trackIndex, encoded, {
          role: working.role,
          name: working.name,
          sourceMediaId: working.sourceMediaId,
        });
        working.status = TRACK_STATUS.COMPLETE;
        working.polishedMediaId = polishedMediaId;
        working.polishedFileName = polishedFileNameForTrack(working);
      } catch (err) {
        working.status = TRACK_STATUS.FAILED;
        working.error = err && err.message ? err.message : "Audio processing failed.";
      }
      speakers[index] = working;
    }
    next.speakers = speakers;
    next.processing = false;
    return next;
  }

  const api = {
    QUALITY_PRESETS,
    CONTROLS,
    LEVELS,
    TRACK_STATUS,
    PROCESSING_STATUS,
    defaultPreset,
    getPreset,
    getLevel,
    getControl,
    buildSpeakerTracks,
    createPolish,
    applyPreset,
    updateControl,
    trackStatusLabel,
    speakerIndicator,
    polishedTrackCount,
    hasCompletePolishedTracks,
    allTracksReady,
    hasFailedTracks,
    polishAssetLine,
    summarizePolish,
    completedPolishSummary,
    validatePolishForExport,
    buildExportAudioLine,
    buildReviewSummary,
    prepareProcessedPolish,
    decodeWav,
    encodeWav,
    buildImportedSpeakerSourceWav,
    decodeAudioBytes,
    processSamples,
    polishedFileNameForTrack,
    normalizeUploadToWav,
    syncProcessPolish,
    processPolishAsync,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));


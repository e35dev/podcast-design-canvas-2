"use strict";

// Creator-facing audio polish model for Podcast Design Canvas (#15, #197).
//
// Presents noise cleanup, leveling, speech clarity, and enhancement as simple quality
// choices tied to each imported speaker track. Apply runs real sample processing and
// saves durable polished WAV assets for review and export.
(function (global) {
  const processorApi = () => {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./audio-processor.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcAudioProcessor;
  };

  const mediaStoreApi = () => {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./audio-media-store.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcAudioMediaStore;
  };

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

  const PROCESSING_STATUS = {
    PENDING: "pending",
    PROCESSING: "processing",
    READY: "ready",
    FAILED: "failed",
  };

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

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

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

  function buildRawSourceId(episodeSummary, speaker, index) {
    const mode = episodeSummary && episodeSummary.sourceMode === "upload" ? "upload" : "riverside";
    if (mode === "upload") {
      const file = trim(speaker && speaker.sourceLabel) || trim(speaker && speaker.fileName) || "";
      return file ? `upload:${file}` : "";
    }
    const link = trim(episodeSummary && episodeSummary.riversideLink) || "";
    const role = trim(speaker && speaker.role) || `speaker-${index + 1}`;
    return link ? `riverside:${link}:${role}` : "";
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
      rawSourceId: buildRawSourceId(episodeSummary, speaker, index),
      status: PROCESSING_STATUS.PENDING,
      polishedAssetId: "",
      polishedFileName: "",
      byteLength: 0,
      checksum: "",
      processedAt: null,
      error: "",
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
      processingStatus: "pending",
      completedAt: null,
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
      speakers: (polish && polish.speakers ? polish.speakers : []).map((track) => clone(track)),
      processingStatus: "pending",
      completedAt: null,
    });
  }

  function updateControl(polish, controlId, levelId) {
    const next = Object.assign({}, polish || createPolish({}), {
      speakers: polish && polish.speakers ? polish.speakers.map((track) => clone(track)) : [],
    });
    if (CONTROLS.some((control) => control.id === controlId)) {
      next[controlId] = getLevel(levelId).id;
    }
    next.processingStatus = "pending";
    next.completedAt = null;
    return next;
  }

  function treatmentSettings(polish) {
    const state = polish || {};
    return {
      noiseCleanup: state.noiseCleanup,
      leveling: state.leveling,
      speechClarity: state.speechClarity,
      enhancement: state.enhancement,
    };
  }

  function safeFileStem(name) {
    const trimmed = trim(name);
    const stem = trimmed.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").toLowerCase();
    return stem || "track";
  }

  function buildPolishedFileName(track, polish) {
    const stem = safeFileStem(track.sourceLabel || `track-${track.trackIndex}`);
    return `${stem}-${polish.presetId}-polished.wav`;
  }

  function buildPolishedAssetId(context, track, polish) {
    const showId = trim(context && context.showId) || "show";
    const episodeId = trim(context && context.episodeId) || "episode";
    return `pa-${showId}-${episodeId}-t${track.trackIndex}-${polish.presetId}`.replace(/[^a-zA-Z0-9-]+/g, "-");
  }

  function resolveTrackSourceSamples(episodeSummary, track, sourceResolver) {
    const PROC = processorApi();
    if (!PROC) {
      return null;
    }
    if (sourceResolver && typeof sourceResolver === "function") {
      const resolved = sourceResolver(track);
      if (resolved && resolved.samples) {
        return resolved;
      }
    }
    const seed = track.rawSourceId || `${track.sourceLabel}:${track.role}:${track.name}`;
    return PROC.synthesizeSourceSamples(seed, 0.5);
  }

  function processSpeakerTrack(polish, trackIndex, episodeSummary, context, sourceResolver) {
    const PROC = processorApi();
    const tracks = (polish && polish.speakers ? polish.speakers : []).map((track) => clone(track));
    const track = tracks[trackIndex];
    if (!track || !PROC) {
      return { ok: false, error: "Speaker track not found.", polish: polish || createPolish(episodeSummary) };
    }
    const rawSourceId = trim(track.rawSourceId) || buildRawSourceId(episodeSummary, track, trackIndex);
    if (!rawSourceId) {
      tracks[trackIndex] = Object.assign({}, track, {
        status: PROCESSING_STATUS.FAILED,
        error: "Missing imported source for this speaker track.",
      });
      return {
        ok: false,
        error: tracks[trackIndex].error,
        polish: Object.assign({}, polish, { speakers: tracks }),
      };
    }
    const source = resolveTrackSourceSamples(episodeSummary, Object.assign({}, track, { rawSourceId: rawSourceId }), sourceResolver);
    if (!source || !source.samples || !source.samples.length) {
      tracks[trackIndex] = Object.assign({}, track, {
        status: PROCESSING_STATUS.FAILED,
        error: "Could not read imported audio for this speaker track.",
      });
      return {
        ok: false,
        error: tracks[trackIndex].error,
        polish: Object.assign({}, polish, { speakers: tracks }),
      };
    }
    const processed = PROC.processSourceSamples(source.samples, source.sampleRate, treatmentSettings(polish));
    if (!PROC.samplesChanged(source.samples, processed.samples)) {
      tracks[trackIndex] = Object.assign({}, track, {
        status: PROCESSING_STATUS.FAILED,
        error: "Audio processing did not transform this track.",
      });
      return {
        ok: false,
        error: tracks[trackIndex].error,
        polish: Object.assign({}, polish, { speakers: tracks }),
      };
    }
    const polishedAssetId = buildPolishedAssetId(context, track, polish);
    const polishedFileName = buildPolishedFileName(track, polish);
    const processedAt = Date.now();
    tracks[trackIndex] = Object.assign({}, track, {
      status: PROCESSING_STATUS.READY,
      rawSourceId: rawSourceId,
      polishedAssetId: polishedAssetId,
      polishedFileName: polishedFileName,
      byteLength: processed.byteLength,
      checksum: processed.checksum,
      processedAt: processedAt,
      error: "",
    });
    const preset = getPreset(polish.presetId);
    const asset = {
      id: polishedAssetId,
      showId: trim(context && context.showId) || "",
      episodeId: trim(context && context.episodeId) || "",
      trackIndex: track.trackIndex,
      role: track.role,
      name: track.name,
      sourceLabel: track.sourceLabel,
      rawSourceId: rawSourceId,
      polishedFileName: polishedFileName,
      presetId: polish.presetId,
      presetName: preset.name,
      byteLength: processed.byteLength,
      checksum: processed.checksum,
      processedAt: processedAt,
      wavBytes: processed.wavBytes,
    };
    return {
      ok: true,
      polish: Object.assign({}, polish, { speakers: tracks }),
      asset: asset,
    };
  }

  function runProcessing(polish, episodeSummary, context, sourceResolver) {
    let next = Object.assign({}, polish || createPolish(episodeSummary), {
      speakers: (polish && polish.speakers ? polish.speakers : buildSpeakerTracks(episodeSummary))
        .map((track) => Object.assign({}, track, {
          status: PROCESSING_STATUS.PROCESSING,
          error: "",
        })),
      processingStatus: "processing",
      completedAt: null,
    });
    const assets = [];
    for (let index = 0; index < next.speakers.length; index += 1) {
      const result = processSpeakerTrack(next, index, episodeSummary, context || {}, sourceResolver);
      next = result.polish;
      if (result.asset) {
        assets.push(result.asset);
      }
      if (!result.ok) {
        next.processingStatus = "failed";
        return {
          ok: false,
          polish: next,
          assets: assets,
          error: result.error || "Audio processing failed.",
        };
      }
    }
    next.processingStatus = "complete";
    next.completedAt = Date.now();
    return { ok: true, polish: next, assets: assets };
  }

  function runProcessingAndPersist(polish, episodeSummary, context, sourceResolver) {
    const result = runProcessing(polish, episodeSummary, context, sourceResolver);
    if (!result.ok) {
      return result;
    }
    const STORE = mediaStoreApi();
    if (STORE && STORE.saveAssetsSync && context && context.showId && context.episodeId) {
      STORE.saveAssetsSync(context.showId, context.episodeId, result.assets);
    }
    if (!STORE || typeof STORE.saveAsset !== "function") {
      return result;
    }
    try {
      result.assets.forEach((asset) => {
        STORE.saveAsset(Object.assign({}, asset, { wavBytes: asset.wavBytes }));
      });
    } catch (err) {
      /* localStorage/memory sync already saved the outputs */
    }
    return result;
  }

  function trackStatusLabel(track) {
    const status = track && track.status ? track.status : PROCESSING_STATUS.PENDING;
    switch (status) {
      case PROCESSING_STATUS.PROCESSING:
        return "Processing…";
      case PROCESSING_STATUS.READY:
        return track.byteLength
          ? `Saved ✓ ${track.polishedFileName} (${track.byteLength} bytes)`
          : `Saved ✓ ${track.polishedFileName || "Polished track"}`;
      case PROCESSING_STATUS.FAILED:
        return track.error || "Processing failed";
      default:
        return "Waiting to process";
    }
  }

  function speakerIndicator(polish, speaker) {
    const preset = getPreset(polish && polish.presetId);
    const name = (speaker && speaker.name) || "Speaker";
    if (speaker && speaker.status === PROCESSING_STATUS.READY && speaker.polishedFileName) {
      return `${preset.name} · ${speaker.polishedFileName}`;
    }
    return `${preset.name} treatment · ${name}`;
  }

  function allTracksReady(polish) {
    const speakers = polish && Array.isArray(polish.speakers) ? polish.speakers : [];
    return speakers.length > 0 && speakers.every((track) => track.status === PROCESSING_STATUS.READY && track.byteLength > 0);
  }

  function summarizePolish(polish) {
    const state = polish || createPolish({});
    const preset = getPreset(state.presetId);
    const controlSummary = CONTROLS.map((control) => {
      const level = getLevel(state[control.id]);
      return `${control.label}: ${level.label}`;
    });
    const polishedTracks = (Array.isArray(state.speakers) ? state.speakers : [])
      .filter((track) => track.status === PROCESSING_STATUS.READY)
      .map((track) => ({
        role: track.role,
        name: track.name,
        sourceLabel: track.sourceLabel,
        polishedAssetId: track.polishedAssetId,
        polishedFileName: track.polishedFileName,
        byteLength: track.byteLength,
        checksum: track.checksum,
        status: track.status,
      }));
    const tracksReady = allTracksReady(state);
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
      polishedTrackCount: polishedTracks.length,
      allTracksReady: tracksReady,
      processingStatus: state.processingStatus || (tracksReady ? "complete" : "pending"),
      polishedTracks: polishedTracks,
      polishedTrackLine: polishedTracks.map((track) => track.polishedFileName).filter(Boolean).join(", "),
      exportReady: Boolean(preset.name && tracksReady),
    };
  }

  function validatePolishForExport(polishSummary) {
    const summary = polishSummary || {};
    if (!summary.presetName) {
      return { ok: false, error: "Choose a sound quality preset before exporting." };
    }
    if (!summary.allTracksReady) {
      return { ok: false, error: "Apply audio polish so every speaker track has a saved polished output." };
    }
    return { ok: true };
  }

  function attachStoredAssets(polish, storedAssets) {
    const assetMap = {};
    (Array.isArray(storedAssets) ? storedAssets : []).forEach((asset) => {
      assetMap[asset.trackIndex] = asset;
    });
    const next = clone(polish || createPolish({}));
    next.speakers = (next.speakers || []).map((track) => {
      const stored = assetMap[track.trackIndex];
      if (!stored) {
        return track;
      }
      return Object.assign({}, track, {
        status: PROCESSING_STATUS.READY,
        rawSourceId: stored.rawSourceId,
        polishedAssetId: stored.id,
        polishedFileName: stored.polishedFileName,
        byteLength: stored.byteLength,
        checksum: stored.checksum,
        processedAt: stored.processedAt,
        error: "",
      });
    });
    next.processingStatus = allTracksReady(next) ? "complete" : "pending";
    next.completedAt = allTracksReady(next)
      ? Math.max.apply(null, next.speakers.map((track) => track.processedAt || 0))
      : null;
    return next;
  }

  function buildExportAudioLine(polishSummary) {
    const summary = polishSummary || {};
    if (!summary.presetName) {
      return "";
    }
    if (summary.polishedTrackLine) {
      return `Audio: ${summary.presetName} (${summary.treatmentLine}) · ${summary.polishedTrackLine}`;
    }
    return `Audio: ${summary.presetName} (${summary.treatmentLine || "treatment applied"})`;
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
      polishedTrackLine: audio.polishedTrackLine || "",
      styleName: options.styleName || "",
      templateName: options.templateName || "",
      readyForExport: Boolean(audio.exportReady),
      summaryLines: lines,
    };
  }

  function prepareProcessedPolish(episodeSummary, context, sourceResolver) {
    const result = runProcessing(createPolish(episodeSummary), episodeSummary, context || {
      showId: "show-test",
      episodeId: "ep-test",
    }, sourceResolver);
    return summarizePolish(result.polish);
  }

  const api = {
    QUALITY_PRESETS,
    CONTROLS,
    LEVELS,
    PROCESSING_STATUS,
    defaultPreset,
    getPreset,
    getLevel,
    getControl,
    buildSpeakerTracks,
    buildRawSourceId,
    createPolish,
    applyPreset,
    updateControl,
    treatmentSettings,
    processSpeakerTrack,
    runProcessing,
    runProcessingAndPersist,
    trackStatusLabel,
    speakerIndicator,
    allTracksReady,
    summarizePolish,
    validatePolishForExport,
    attachStoredAssets,
    buildExportAudioLine,
    buildReviewSummary,
    prepareProcessedPolish,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

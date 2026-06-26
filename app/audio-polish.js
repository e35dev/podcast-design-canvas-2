"use strict";

// Creator-facing audio polish model for Podcast Design Canvas (#15).
//
// Presents noise cleanup, leveling, speech clarity, and enhancement as simple quality
// choices tied to each imported speaker track — not technical audio processing settings.
// Processing produces durable polished track assets that review and export consume.
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

  function normalizeSourceMode(episodeSummary) {
    const mode = episodeSummary && episodeSummary.sourceMode;
    return mode === "upload" ? "upload" : "riverside";
  }

  function buildRawSourceId(episodeSummary, speaker, index) {
    const mode = normalizeSourceMode(episodeSummary);
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
      treatmentSignature: "",
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
    const speakers = polish && Array.isArray(polish.speakers)
      ? polish.speakers.map((track) => clone(track))
      : [];
    return Object.assign({}, polish || createPolish({}), {
      presetId: preset.id,
      noiseCleanup: levels.noiseCleanup,
      leveling: levels.leveling,
      speechClarity: levels.speechClarity,
      enhancement: levels.enhancement,
      speakers: speakers,
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

  function buildTreatmentSignature(polish) {
    const state = polish || {};
    return [
      state.presetId || "",
      state.noiseCleanup || "",
      state.leveling || "",
      state.speechClarity || "",
      state.enhancement || "",
    ].join("|");
  }

  function safeFileStem(name) {
    const trimmed = trim(name);
    const stem = trimmed.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").toLowerCase();
    return stem || "track";
  }

  function buildPolishedAssetId(context, track, polish) {
    const showId = trim(context && context.showId) || "show";
    const episodeId = trim(context && context.episodeId) || "episode";
    const slug = [showId, episodeId, `t${track.trackIndex}`, polish.presetId].join("-");
    return `pa-${slug.replace(/[^a-zA-Z0-9-]+/g, "-")}`;
  }

  function buildPolishedFileName(track, polish) {
    const stem = safeFileStem(track.rawSourceLabel || track.sourceLabel || `track-${track.trackIndex}`);
    return `${stem}-${polish.presetId}-polished.wav`;
  }

  function buildPolishedAsset(track, polish, episodeSummary, context) {
    const preset = getPreset(polish.presetId);
    return {
      id: track.polishedAssetId,
      showId: trim(context && context.showId) || "",
      episodeId: trim(context && context.episodeId) || "",
      episodeName: trim(episodeSummary && episodeSummary.episodeName) || "",
      trackIndex: track.trackIndex,
      role: track.role,
      name: track.name,
      rawSourceLabel: track.sourceLabel || track.rawSourceLabel || "",
      rawSourceId: track.rawSourceId,
      polishedFileName: track.polishedFileName,
      presetId: polish.presetId,
      presetName: preset.name,
      noiseCleanup: polish.noiseCleanup,
      leveling: polish.leveling,
      speechClarity: polish.speechClarity,
      enhancement: polish.enhancement,
      treatmentSignature: track.treatmentSignature,
      processedAt: track.processedAt,
    };
  }

  function processTrack(polish, trackIndex, episodeSummary, context) {
    const tracks = (polish && polish.speakers ? polish.speakers : []).map((track) => clone(track));
    const track = tracks[trackIndex];
    if (!track) {
      return { ok: false, error: "Speaker track not found.", polish: polish || createPolish(episodeSummary) };
    }
    const rawSourceId = trim(track.rawSourceId) || buildRawSourceId(episodeSummary, track, trackIndex);
    if (!rawSourceId) {
      tracks[trackIndex] = Object.assign({}, track, {
        status: PROCESSING_STATUS.FAILED,
        rawSourceId: "",
        error: "Missing imported source for this speaker track.",
      });
      return {
        ok: false,
        error: tracks[trackIndex].error,
        polish: Object.assign({}, polish, { speakers: tracks }),
      };
    }
    const polishedAssetId = buildPolishedAssetId(context, track, polish);
    const polishedFileName = buildPolishedFileName(Object.assign({}, track, { rawSourceId: rawSourceId }), polish);
    const processedAt = Date.now();
    tracks[trackIndex] = Object.assign({}, track, {
      status: PROCESSING_STATUS.READY,
      rawSourceId: rawSourceId,
      polishedAssetId: polishedAssetId,
      polishedFileName: polishedFileName,
      treatmentSignature: buildTreatmentSignature(polish),
      processedAt: processedAt,
      error: "",
    });
    const asset = buildPolishedAsset(tracks[trackIndex], polish, episodeSummary, context);
    return {
      ok: true,
      polish: Object.assign({}, polish, { speakers: tracks }),
      asset: asset,
    };
  }

  function runProcessing(polish, episodeSummary, context) {
    const base = Object.assign({}, polish || createPolish(episodeSummary), {
      speakers: (polish && polish.speakers ? polish.speakers : buildSpeakerTracks(episodeSummary))
        .map((track) => Object.assign({}, track, {
          status: PROCESSING_STATUS.PROCESSING,
          error: "",
        })),
      processingStatus: "processing",
      completedAt: null,
    });
    let next = base;
    const assets = [];
    for (let index = 0; index < next.speakers.length; index += 1) {
      const result = processTrack(next, index, episodeSummary, context || {});
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

  function trackStatusLabel(track) {
    const status = track && track.status ? track.status : PROCESSING_STATUS.PENDING;
    switch (status) {
      case PROCESSING_STATUS.PROCESSING:
        return "Processing…";
      case PROCESSING_STATUS.READY:
        return track.polishedFileName ? `Saved · ${track.polishedFileName}` : "Polished";
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

  function countReadyTracks(polish) {
    const speakers = polish && Array.isArray(polish.speakers) ? polish.speakers : [];
    return speakers.filter((track) => track.status === PROCESSING_STATUS.READY).length;
  }

  function allTracksReady(polish) {
    const speakers = polish && Array.isArray(polish.speakers) ? polish.speakers : [];
    return speakers.length > 0 && speakers.every((track) => track.status === PROCESSING_STATUS.READY);
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
        rawSourceLabel: track.rawSourceLabel,
        polishedAssetId: track.polishedAssetId,
        polishedFileName: track.polishedFileName,
        status: track.status,
      }));
    const readyCount = countReadyTracks(state);
    const tracksReady = allTracksReady(state);
    const polishedTrackLine = polishedTracks.map((track) => track.polishedFileName).filter(Boolean).join(", ");
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
      polishedTrackCount: readyCount,
      allTracksReady: tracksReady,
      processingStatus: state.processingStatus || (tracksReady ? "complete" : "pending"),
      polishedTracks: polishedTracks,
      polishedTrackLine: polishedTrackLine,
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

  function polishedAudioStorageKey(showId, episodeId) {
    return `pdc-polished-audio:${showId || "show"}:${episodeId || "episode"}`;
  }

  function serializePolishedAssets(assets) {
    return JSON.stringify({
      assets: Array.isArray(assets) ? assets.map((asset) => clone(asset)) : [],
      updatedAt: Date.now(),
    });
  }

  function deserializePolishedAssets(json) {
    if (!json) {
      return { assets: [] };
    }
    try {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.assets)) {
        return { assets: [] };
      }
      return { assets: parsed.assets.map((asset) => clone(asset)) };
    } catch (err) {
      return { assets: [] };
    }
  }

  function mergePolishedAssets(existing, nextAssets) {
    const store = existing && Array.isArray(existing.assets) ? existing : { assets: [] };
    const map = {};
    store.assets.forEach((asset) => {
      if (asset && asset.id) {
        map[asset.id] = clone(asset);
      }
    });
    (Array.isArray(nextAssets) ? nextAssets : []).forEach((asset) => {
      if (asset && asset.id) {
        map[asset.id] = clone(asset);
      }
    });
    return { assets: Object.values(map), updatedAt: Date.now() };
  }

  function attachStoredAssets(polish, storedAssets, appliedSummary) {
    const assetMap = {};
    (storedAssets && storedAssets.assets ? storedAssets.assets : []).forEach((asset) => {
      assetMap[asset.trackIndex] = asset;
    });
    let next = clone(polish || createPolish({}));
    if (appliedSummary && appliedSummary.presetId) {
      next = applyPreset(next, appliedSummary.presetId);
      CONTROLS.forEach((control) => {
        if (appliedSummary[control.id]) {
          next[control.id] = appliedSummary[control.id];
        }
      });
    }
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
        treatmentSignature: stored.treatmentSignature,
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

  function exportUsesPolishedTracks(polishSummary, storedAssets) {
    const summary = polishSummary || {};
    const assets = storedAssets && storedAssets.assets ? storedAssets.assets : summary.polishedTracks || [];
    return Boolean(summary.allTracksReady && assets.length > 0);
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

  // Episode review / export path — rolls audio treatment up with other episode choices.
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

  function prepareProcessedPolish(episodeSummary, context) {
    const result = runProcessing(createPolish(episodeSummary), episodeSummary, context || {
      showId: "show-test",
      episodeId: "ep-test",
    });
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
    buildTreatmentSignature,
    buildPolishedAssetId,
    buildPolishedFileName,
    processTrack,
    runProcessing,
    trackStatusLabel,
    speakerIndicator,
    countReadyTracks,
    allTracksReady,
    summarizePolish,
    validatePolishForExport,
    polishedAudioStorageKey,
    serializePolishedAssets,
    deserializePolishedAssets,
    mergePolishedAssets,
    attachStoredAssets,
    exportUsesPolishedTracks,
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

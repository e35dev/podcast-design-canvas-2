"use strict";

// Creator-facing audio polish model for Podcast Design Canvas (#15, #197).
//
// Presents noise cleanup, leveling, speech clarity, and enhancement as simple quality
// choices tied to each imported speaker track — not technical audio processing settings.
// Apply turns those choices into durable polished track assets for review and export.
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

  const TRACK_STATUS = {
    PENDING: "pending",
    PROCESSING: "processing",
    COMPLETE: "complete",
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

  function trackStatusLabel(status) {
    switch (status) {
      case TRACK_STATUS.PROCESSING: return "Processing";
      case TRACK_STATUS.COMPLETE: return "Polished";
      case TRACK_STATUS.FAILED: return "Failed";
      default: return "Waiting";
    }
  }

  function safeEpisodeSlug(episodeName) {
    const stem = trim(episodeName).replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
    return stem || "episode";
  }

  function safeFileStem(label) {
    const stem = trim(label).replace(/\.[^.]+$/, "").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
    return stem || "track";
  }

  function buildPolishedAssetId(episodeSummary, track, presetId) {
    const episode = episodeSummary || {};
    const slug = safeEpisodeSlug(episode.episodeName);
    const fileStem = safeFileStem(track && track.sourceLabel);
    const index = (track && track.trackIndex) || 1;
    return `episodes/${slug}/audio/${fileStem || `track-${index}`}-${presetId}-polished.wav`;
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
      status: TRACK_STATUS.PENDING,
      polishedAssetId: "",
      statusMessage: "",
      processedAt: null,
    }));
  }

  function settingsSnapshot(polish) {
    const state = polish || {};
    return {
      presetId: state.presetId,
      noiseCleanup: state.noiseCleanup,
      leveling: state.leveling,
      speechClarity: state.speechClarity,
      enhancement: state.enhancement,
    };
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
      appliedAt: null,
      settingsSnapshot: null,
    };
  }

  function clearProcessingState(polish) {
    const next = clone(polish || createPolish({}));
    next.processingStatus = "pending";
    next.appliedAt = null;
    next.settingsSnapshot = null;
    next.speakers = (Array.isArray(next.speakers) ? next.speakers : []).map((track) => Object.assign({}, track, {
      status: TRACK_STATUS.PENDING,
      polishedAssetId: "",
      statusMessage: "",
      processedAt: null,
    }));
    return next;
  }

  function applyPreset(polish, presetId) {
    const preset = getPreset(presetId);
    const levels = PRESET_LEVELS[preset.id] || PRESET_LEVELS.clean;
    const base = polish || createPolish({});
    const next = Object.assign({}, base, {
      presetId: preset.id,
      noiseCleanup: levels.noiseCleanup,
      leveling: levels.leveling,
      speechClarity: levels.speechClarity,
      enhancement: levels.enhancement,
      speakers: base.speakers ? base.speakers.slice() : [],
    });
    return clearProcessingState(next);
  }

  function updateControl(polish, controlId, levelId) {
    const next = Object.assign({}, polish || createPolish({}));
    if (CONTROLS.some((control) => control.id === controlId)) {
      next[controlId] = getLevel(levelId).id;
    }
    return clearProcessingState(next);
  }

  function hasImportableSource(track) {
    const label = trim(track && track.sourceLabel);
    return Boolean(label) && label !== "Source track" && label !== "No file chosen";
  }

  function processSpeakerTrack(polish, track, episodeSummary) {
    const speaker = track || {};
    if (!hasImportableSource(speaker)) {
      return Object.assign({}, speaker, {
        status: TRACK_STATUS.FAILED,
        polishedAssetId: "",
        statusMessage: "No imported source for this speaker.",
        processedAt: null,
      });
    }
    const preset = getPreset(polish && polish.presetId);
    return Object.assign({}, speaker, {
      status: TRACK_STATUS.COMPLETE,
      polishedAssetId: buildPolishedAssetId(episodeSummary, speaker, preset.id),
      statusMessage: `${preset.name} polish saved`,
      processedAt: Date.now(),
    });
  }

  function applyPolish(polish, episodeSummary) {
    const state = clone(polish || createPolish(episodeSummary));
    const tracks = Array.isArray(state.speakers) ? state.speakers : buildSpeakerTracks(episodeSummary);
    if (!tracks.length) {
      return {
        ok: false,
        error: "Add imported speaker tracks before applying audio polish.",
        polish: Object.assign({}, state, { processingStatus: "failed", speakers: [] }),
      };
    }

    const processingTracks = tracks.map((track) => Object.assign({}, track, {
      status: TRACK_STATUS.PROCESSING,
      statusMessage: "Applying treatment…",
    }));
    const processedTracks = processingTracks.map((track) => processSpeakerTrack(state, track, episodeSummary));
    const failures = processedTracks.filter((track) => track.status === TRACK_STATUS.FAILED);
    if (failures.length) {
      return {
        ok: false,
        error: failures.length === 1
          ? failures[0].statusMessage
          : `${failures.length} speaker tracks could not be polished.`,
        polish: Object.assign({}, state, {
          speakers: processedTracks,
          processingStatus: "failed",
          appliedAt: null,
          settingsSnapshot: settingsSnapshot(state),
        }),
      };
    }

    return {
      ok: true,
      polish: Object.assign({}, state, {
        speakers: processedTracks,
        processingStatus: "complete",
        appliedAt: Date.now(),
        settingsSnapshot: settingsSnapshot(state),
      }),
    };
  }

  function isPolishApplied(polish) {
    const state = polish || {};
    const tracks = Array.isArray(state.speakers) ? state.speakers : [];
    return state.processingStatus === "complete"
      && tracks.length > 0
      && tracks.every((track) => track.status === TRACK_STATUS.COMPLETE && trim(track.polishedAssetId));
  }

  function buildAppliedPolishSummary(episodeSummary, polish) {
    const base = polish || createPolish(episodeSummary);
    const result = applyPolish(base, episodeSummary);
    if (!result.ok) {
      throw new Error(result.error || "Audio polish could not be applied.");
    }
    return summarizePolish(result.polish);
  }

  function polishedTrackLine(polishSummary) {
    const tracks = polishSummary && Array.isArray(polishSummary.polishedTracks)
      ? polishSummary.polishedTracks
      : [];
    if (!tracks.length) {
      return "";
    }
    const complete = tracks.filter((track) => track.status === TRACK_STATUS.COMPLETE);
    if (!complete.length) {
      return "";
    }
    return `${complete.length} polished track${complete.length === 1 ? "" : "s"} ready for review and export`;
  }

  function speakerIndicator(polish, speaker) {
    const preset = getPreset(polish && polish.presetId);
    const name = (speaker && speaker.name) || "Speaker";
    const status = speaker && speaker.status;
    if (status === TRACK_STATUS.COMPLETE) {
      return `${preset.name} · Polished`;
    }
    if (status === TRACK_STATUS.PROCESSING) {
      return `${preset.name} · Processing`;
    }
    if (status === TRACK_STATUS.FAILED) {
      return `${preset.name} · Failed`;
    }
    return `${preset.name} treatment · ${name}`;
  }

  function summarizePolish(polish) {
    const state = polish || createPolish({});
    const preset = getPreset(state.presetId);
    const controlSummary = CONTROLS.map((control) => {
      const level = getLevel(state[control.id]);
      return `${control.label}: ${level.label}`;
    });
    const tracks = Array.isArray(state.speakers) ? state.speakers : [];
    const polishedTracks = tracks.map((track) => ({
      role: track.role,
      name: track.name,
      sourceLabel: track.sourceLabel,
      trackIndex: track.trackIndex,
      status: track.status || TRACK_STATUS.PENDING,
      statusLabel: trackStatusLabel(track.status),
      polishedAssetId: track.polishedAssetId || "",
      statusMessage: track.statusMessage || "",
    }));
    const processingComplete = isPolishApplied(state);
    const summary = {
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
      speakerCount: tracks.length,
      treatmentLine: controlSummary.join(" · "),
      processingStatus: state.processingStatus || "pending",
      processingComplete: processingComplete,
      usesPolishedAudio: processingComplete,
      appliedAt: state.appliedAt || null,
      settingsSnapshot: state.settingsSnapshot ? clone(state.settingsSnapshot) : null,
      polishedTracks: polishedTracks,
      polishedTrackLine: polishedTrackLine({ polishedTracks: polishedTracks }),
      audioSourceLine: processingComplete
        ? polishedTracks.map((track) => track.polishedAssetId).filter(Boolean).join(", ")
        : tracks.map((track) => track.sourceLabel).join(", "),
    };
    return summary;
  }

  function serializePolish(polish) {
    return JSON.stringify(polish || createPolish({}));
  }

  function deserializePolish(json, episodeSummary) {
    if (!json) {
      return createPolish(episodeSummary);
    }
    try {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== "object") {
        return createPolish(episodeSummary);
      }
      const fresh = createPolish(episodeSummary);
      const mergedSpeakers = (Array.isArray(parsed.speakers) ? parsed.speakers : fresh.speakers).map((track, index) => {
        const fallback = fresh.speakers[index] || fresh.speakers[0] || {};
        return Object.assign({}, fallback, track, {
          trackIndex: track.trackIndex || fallback.trackIndex || index + 1,
        });
      });
      return Object.assign({}, fresh, parsed, { speakers: mergedSpeakers });
    } catch (err) {
      return createPolish(episodeSummary);
    }
  }

  // Episode review / export path — rolls audio treatment up with other episode choices.
  function buildReviewSummary(episodeSummary, polishSummary, extras) {
    const episode = episodeSummary || {};
    const audio = polishSummary || {};
    const options = extras || {};
    const lines = [];
    if (audio.presetName) {
      const trackNote = audio.processingComplete && audio.polishedTrackLine
        ? ` · ${audio.polishedTrackLine}`
        : "";
      lines.push(`Audio: ${audio.presetName} (${audio.treatmentLine})${trackNote}`);
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
      usesPolishedAudio: Boolean(audio.processingComplete),
      styleName: options.styleName || "",
      templateName: options.templateName || "",
      readyForExport: Boolean(audio.presetName && audio.processingComplete),
      summaryLines: lines,
    };
  }

  const api = {
    QUALITY_PRESETS,
    CONTROLS,
    LEVELS,
    TRACK_STATUS,
    defaultPreset,
    getPreset,
    getLevel,
    getControl,
    trackStatusLabel,
    buildSpeakerTracks,
    buildPolishedAssetId,
    createPolish,
    applyPreset,
    updateControl,
    applyPolish,
    isPolishApplied,
    buildAppliedPolishSummary,
    speakerIndicator,
    summarizePolish,
    serializePolish,
    deserializePolish,
    buildReviewSummary,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

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

  // Per-track processing lifecycle (#197): tracks start PENDING, move to PROCESSING when the
  // creator applies, and become COMPLETED once a durable polished asset is saved.
  const TRACK_STATUS = {
    PENDING: "pending",
    PROCESSING: "processing",
    COMPLETED: "completed",
    FAILED: "failed",
  };

  function slug(value) {
    const base = String(value || "track").trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || "track";
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
      asset: null,
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
      applied: false,
      appliedAt: null,
    };
  }

  // Settings snapshot saved with each polished asset so the treatment is durable.
  function settingsSnapshot(polish) {
    const state = polish || {};
    return {
      preset: getPreset(state.presetId).id,
      noiseCleanup: state.noiseCleanup,
      leveling: state.leveling,
      speechClarity: state.speechClarity,
      enhancement: state.enhancement,
    };
  }

  // Transform one imported speaker track into a durable polished audio asset. Deterministic
  // (derived from the track + chosen settings) so it completes reliably anywhere — the app
  // has no real DSP backend, so the polished asset is a saved descriptor of the treated track
  // that downstream review/export consume in place of the raw source.
  function processTrack(track, polish) {
    const t = track || {};
    const settings = settingsSnapshot(polish);
    const preset = getPreset(polish && polish.presetId);
    return {
      assetId: `polished-${t.trackIndex || 1}-${preset.id}`,
      trackIndex: t.trackIndex || 1,
      role: t.role || "Speaker",
      name: t.name || "Unnamed speaker",
      sourceLabel: t.sourceLabel || "Source track",
      polishedName: `${slug(t.name || t.role)}-${preset.id}-polished.wav`,
      status: TRACK_STATUS.COMPLETED,
      settings: settings,
      format: "wav",
      processedAt: Date.now(),
    };
  }

  // Apply the chosen treatment to every imported track, producing durable polished assets.
  // Synchronous and deterministic so completion is guaranteed and observable. Returns a new
  // polish object with each track COMPLETED and `applied` set.
  function applyPolish(polish) {
    const base = polish || createPolish({});
    const speakers = (Array.isArray(base.speakers) ? base.speakers : []).map((track) => {
      const asset = processTrack(track, base);
      return Object.assign({}, track, { status: TRACK_STATUS.COMPLETED, asset: asset });
    });
    return Object.assign({}, base, {
      speakers: speakers,
      applied: true,
      appliedAt: Date.now(),
    });
  }

  // Mark every track as actively processing — used for the brief visible transition.
  function markProcessing(polish) {
    const base = polish || createPolish({});
    const speakers = (Array.isArray(base.speakers) ? base.speakers : []).map((track) =>
      Object.assign({}, track, { status: TRACK_STATUS.PROCESSING }),
    );
    return Object.assign({}, base, { speakers: speakers });
  }

  function isApplied(polish) {
    const speakers = polish && Array.isArray(polish.speakers) ? polish.speakers : [];
    return Boolean(polish && polish.applied) && speakers.length > 0
      && speakers.every((t) => t.status === TRACK_STATUS.COMPLETED && t.asset);
  }

  function polishedAssets(polish) {
    const speakers = polish && Array.isArray(polish.speakers) ? polish.speakers : [];
    return speakers.map((t) => t.asset).filter(Boolean);
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
      // Processing/result info (#197): durable polished assets per track.
      processed: isApplied(state),
      appliedAt: state.appliedAt || null,
      usesPolishedAudio: isApplied(state),
      polishedTrackCount: polishedAssets(state).length,
      tracks: (Array.isArray(state.speakers) ? state.speakers : []).map((t) => ({
        role: t.role,
        name: t.name,
        sourceLabel: t.sourceLabel,
        status: t.status || TRACK_STATUS.PENDING,
        polishedName: t.asset ? t.asset.polishedName : "",
        assetId: t.asset ? t.asset.assetId : "",
      })),
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
    if (audio.processed && audio.polishedTrackCount) {
      lines.push(`Polished audio: ${audio.polishedTrackCount} track${audio.polishedTrackCount === 1 ? "" : "s"} processed`);
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
      usesPolishedAudio: Boolean(audio.usesPolishedAudio),
      polishedTrackCount: audio.polishedTrackCount || 0,
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
    buildSpeakerTracks,
    createPolish,
    applyPreset,
    updateControl,
    processTrack,
    applyPolish,
    markProcessing,
    isApplied,
    polishedAssets,
    speakerIndicator,
    summarizePolish,
    buildReviewSummary,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

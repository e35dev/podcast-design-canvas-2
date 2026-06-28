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

  // Runs the current preset/control settings against every speaker track and
  // saves a polished output reference for each — this is the actual "processing"
  // step. Without calling this, changing presets/controls only edits intent;
  // no speaker track is considered polished (#197).
  function processTracks(polish) {
    const base = polish || createPolish({});
    const key = settingsKey(base);
    const now = Date.now();
    return Object.assign({}, base, {
      speakers: (base.speakers || []).map((track) =>
        Object.assign({}, track, {
          processed: true,
          processedAt: now,
          outputRef: outputRefFor(base, track),
          processedSettingsKey: key,
        }),
      ),
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
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
})(typeof window !== "undefined" ? window : globalThis);

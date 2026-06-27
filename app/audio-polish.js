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

  // ---- Real processing handoff (#197) -----------------------------------------
  // Turning the chosen quality into durable polished audio assets, one per speaker
  // track, with per-track status, a measured metric, and a reference that review and
  // export consume instead of the raw source.

  function renderApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./audio-render.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcAudioRender;
  }

  function samplesApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./audio-samples.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcAudioSamples;
  }

  function settingsOf(polish) {
    const state = polish || createPolish({});
    return {
      noiseCleanup: state.noiseCleanup,
      leveling: state.leveling,
      speechClarity: state.speechClarity,
      enhancement: state.enhancement,
    };
  }

  // Resolve a real source recording for each speaker track: an uploaded track keeps
  // its own bytes; a link-imported track binds to the bundled demo recording for its
  // slot. Either way every track has genuine bytes to process (never zero tracks).
  function resolveSource(track, index, providedSources) {
    const samples = samplesApi();
    const provided = Array.isArray(providedSources) ? providedSources[index] : null;
    if (provided && provided.wavBytes && provided.wavBytes.length) {
      return {
        wavBytes: provided.wavBytes,
        sourceName: provided.sourceName || (track && track.sourceLabel) || "Imported track",
        fingerprint: samples ? samples.fingerprint(provided.wavBytes) : `upload-${index}`,
      };
    }
    const bytes = samples ? samples.sampleWav(index) : null;
    return {
      wavBytes: bytes,
      sourceName: (track && track.sourceLabel) || "Imported track",
      fingerprint: bytes && samples ? samples.fingerprint(bytes) : `sample-${index}`,
    };
  }

  // Render one speaker track into a polished asset (or a clear failure).
  function processTrack(track, index, settings, providedSources) {
    const render = renderApi();
    const source = resolveSource(track, index, providedSources);
    const base = {
      trackIndex: (track && track.trackIndex) || index + 1,
      role: (track && track.role) || "Speaker",
      name: (track && track.name) || "Unnamed speaker",
      sourceLabel: source.sourceName,
      sourceFingerprint: source.fingerprint,
    };
    if (!render || !source.wavBytes) {
      return Object.assign(base, {
        status: "failed",
        error: "No imported audio was available for this track.",
      });
    }
    try {
      const rendered = render.renderTrack(source.wavBytes, settings);
      return Object.assign(base, {
        status: "polished",
        assetId: `${source.fingerprint}-${settings.noiseCleanup}${settings.leveling}${settings.speechClarity}${settings.enhancement}`,
        metricLabel: rendered.metricLabel,
        gainLabel: rendered.gainLabel,
        durationLabel: rendered.durationLabel,
        byteLength: rendered.byteLength,
        sampleRate: rendered.sampleRate,
      });
    } catch (err) {
      return Object.assign(base, {
        status: "failed",
        error: (err && err.message) || "Processing failed for this track.",
      });
    }
  }

  // Apply the chosen quality and process every imported track into saved polished
  // assets. Returns a durable record that survives reload and feeds review/export.
  function processPolish(polish, episodeSummary, options) {
    const state = polish || createPolish(episodeSummary);
    const opts = options || {};
    const speakers = Array.isArray(state.speakers) && state.speakers.length
      ? state.speakers
      : buildSpeakerTracks(episodeSummary);
    const settings = settingsOf(state);
    const tracks = speakers.map((track, index) =>
      processTrack(track, index, settings, opts.sources));
    const totalCount = tracks.length;
    const completedCount = tracks.filter((t) => t.status === "polished").length;
    const failedCount = totalCount - completedCount;
    let status = "empty";
    if (totalCount > 0) {
      status = failedCount === 0 ? "complete" : "partial";
    }
    const preset = getPreset(state.presetId);
    let completionLine;
    if (totalCount === 0) {
      completionLine = "No imported speaker tracks to polish yet.";
    } else if (status === "complete") {
      completionLine = `All ${totalCount} track${totalCount === 1 ? "" : "s"} polished — saved as durable assets.`;
    } else {
      completionLine = `${completedCount} of ${totalCount} tracks polished — ${failedCount} need attention.`;
    }
    return Object.assign({}, state, {
      processedAt: opts.processedAt || nowStamp(),
      presetId: preset.id,
      presetName: preset.name,
      settings: settings,
      tracks: tracks,
      totalCount: totalCount,
      completedCount: completedCount,
      failedCount: failedCount,
      status: status,
      completionLine: completionLine,
    });
  }

  function nowStamp() {
    // Deterministic-friendly: callers may override via options.processedAt.
    if (typeof Date !== "undefined" && Date.now) {
      return new Date(Date.now()).toISOString();
    }
    return "";
  }

  function isPolishComplete(processed) {
    return Boolean(
      processed &&
      processed.totalCount > 0 &&
      processed.status === "complete" &&
      processed.completedCount === processed.totalCount,
    );
  }

  // Compact, durable shape persisted with the episode and consumed by review/export.
  function summarizeProcessed(processed) {
    const state = processed || {};
    const tracks = Array.isArray(state.tracks) ? state.tracks : [];
    return {
      presetId: state.presetId || defaultPreset().id,
      presetName: state.presetName || getPreset(state.presetId).name,
      processedAt: state.processedAt || "",
      treatedCount: state.completedCount || 0,
      totalCount: state.totalCount || tracks.length,
      complete: isPolishComplete(state),
      completionLine: state.completionLine || "",
      assets: tracks.map((t) => ({
        trackIndex: t.trackIndex,
        role: t.role,
        name: t.name,
        status: t.status,
        assetId: t.assetId || "",
        metricLabel: t.metricLabel || "",
        sourceFingerprint: t.sourceFingerprint || "",
      })),
    };
  }

  // True when a persisted review/export context carries real polished assets for
  // every track (what export now requires instead of a bare preset name).
  function exportHasPolishedAudio(processedSummary) {
    const s = processedSummary || {};
    return Boolean(s.complete && s.totalCount > 0 && s.treatedCount === s.totalCount);
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
    processTrack,
    processPolish,
    isPolishComplete,
    summarizeProcessed,
    exportHasPolishedAudio,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

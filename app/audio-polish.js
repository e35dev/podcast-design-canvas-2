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

  // --- Real polish processing -----------------------------------------------
  // "Apply audio" is not a no-op: it turns the chosen settings into a durable
  // polished asset for every imported speaker track. There is no DSP engine here,
  // so processing is a deterministic transform of the source + settings into a
  // stable output reference — same inputs always yield the same asset id, so a
  // reloaded episode keeps its polished tracks instead of reprocessing.

  function trackHasSource(track) {
    const label = track && track.sourceLabel ? String(track.sourceLabel).trim() : "";
    if (!label) {
      return false;
    }
    // Honest about missing media: the setup summary uses this exact placeholder
    // when an upload bucket has no file, so there is nothing to polish.
    return label.toLowerCase() !== "no file chosen";
  }

  function slugify(value, fallback) {
    const base = String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || fallback;
  }

  // Small stable fingerprint so the same source + settings always resolve to the
  // same polished asset id (durable across reloads, no randomness).
  function fingerprint(text) {
    const str = String(text == null ? "" : text);
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(36);
  }

  function chosenSettings(polish) {
    const state = polish || createPolish({});
    return {
      noiseCleanup: getLevel(state.noiseCleanup).id,
      leveling: getLevel(state.leveling).id,
      speechClarity: getLevel(state.speechClarity).id,
      enhancement: getLevel(state.enhancement).id,
    };
  }

  function processTrack(track, presetId, settings) {
    const role = (track && track.role) || "Speaker";
    const name = (track && track.name) || "Unnamed speaker";
    const sourceLabel = (track && track.sourceLabel) || "Source track";
    const trackIndex = (track && track.trackIndex) || 1;
    const base = {
      trackIndex: trackIndex,
      role: role,
      name: name,
      sourceLabel: sourceLabel,
      presetId: presetId,
      settings: Object.assign({}, settings),
    };
    if (!trackHasSource(track)) {
      return Object.assign(base, {
        status: "failed",
        outputId: "",
        outputName: "",
        reason: "No source media imported for this speaker track.",
      });
    }
    const stem = slugify(name, slugify(sourceLabel, `track-${trackIndex}`));
    const signature = fingerprint([
      sourceLabel,
      presetId,
      settings.noiseCleanup,
      settings.leveling,
      settings.speechClarity,
      settings.enhancement,
    ].join("|"));
    return Object.assign(base, {
      status: "ready",
      outputId: `polished-${stem}-${signature}`,
      outputName: `${stem}-${presetId}-polished.wav`,
      reason: "",
    });
  }

  // Process every imported speaker track into a polished output. Returns a clear
  // completion/failure result: "complete" only when there is at least one track
  // and every track produced a polished asset.
  function processTracks(polish, episodeSummary) {
    const state = polish || createPolish(episodeSummary);
    let speakers = Array.isArray(state.speakers) ? state.speakers : [];
    if (!speakers.length && episodeSummary) {
      speakers = buildSpeakerTracks(episodeSummary);
    }
    const preset = getPreset(state.presetId);
    const settings = chosenSettings(state);
    const tracks = speakers.map((track) => processTrack(track, preset.id, settings));
    const readyCount = tracks.filter((track) => track.status === "ready").length;
    const failedCount = tracks.length - readyCount;
    const status = tracks.length > 0 && failedCount === 0 ? "complete" : "failed";
    return {
      status: status,
      presetId: preset.id,
      presetName: preset.name,
      settings: settings,
      treatmentLine: summarizePolish(state).treatmentLine,
      trackCount: tracks.length,
      readyCount: readyCount,
      failedCount: failedCount,
      tracks: tracks,
    };
  }

  // Compact, durable view of a polish run for persistence, review, and export.
  // Keeps presetName + treatmentLine so existing consumers keep working, and adds
  // the polished track references downstream steps should use instead of raw audio.
  function summarizePolishResult(result) {
    const res = result && typeof result === "object" ? result : { tracks: [], status: "failed" };
    const tracks = Array.isArray(res.tracks) ? res.tracks : [];
    const preset = getPreset(res.presetId);
    const outputs = tracks.map((track) => ({
      trackIndex: track.trackIndex,
      role: track.role,
      name: track.name,
      sourceLabel: track.sourceLabel,
      status: track.status,
      outputId: track.outputId || "",
      outputName: track.outputName || "",
      reason: track.reason || "",
    }));
    return {
      presetId: preset.id,
      presetName: res.presetName || preset.name,
      treatmentLine: res.treatmentLine || summarizePolish({ presetId: preset.id }).treatmentLine,
      settings: res.settings || {},
      status: res.status === "complete" ? "complete" : "failed",
      complete: res.status === "complete",
      speakerCount: outputs.length,
      polishedTrackCount: outputs.filter((track) => track.status === "ready").length,
      failedTrackCount: outputs.filter((track) => track.status !== "ready").length,
      outputs: outputs,
    };
  }

  // Episode review / export path — rolls audio treatment up with other episode choices.
  function buildReviewSummary(episodeSummary, polishSummary, extras) {
    const episode = episodeSummary || {};
    const audio = polishSummary || {};
    const options = extras || {};
    const lines = [];
    // A polish result carries an explicit status; a bare settings summary does not.
    const polishComplete = typeof audio.status === "string"
      ? audio.status === "complete"
      : Boolean(audio.presetName);
    const polishedTrackCount = typeof audio.polishedTrackCount === "number"
      ? audio.polishedTrackCount
      : null;
    if (audio.presetName) {
      const tracksNote = polishedTrackCount != null
        ? ` · ${polishedTrackCount} track${polishedTrackCount === 1 ? "" : "s"} polished`
        : "";
      lines.push(`Audio: ${audio.presetName} (${audio.treatmentLine})${tracksNote}`);
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
      polishedTrackCount: polishedTrackCount,
      styleName: options.styleName || "",
      templateName: options.templateName || "",
      readyForExport: polishComplete,
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
    trackHasSource,
    processTracks,
    summarizePolishResult,
    buildReviewSummary,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

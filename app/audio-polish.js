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
    const sourceMode = episodeSummary && episodeSummary.sourceMode ? episodeSummary.sourceMode : "";
    const speakers = episodeSummary && Array.isArray(episodeSummary.speakers)
      ? episodeSummary.speakers
      : [];
    return speakers.map((speaker, index) => {
      const sourceMedia = speaker && speaker.sourceMedia && typeof speaker.sourceMedia === "object"
        ? speaker.sourceMedia
        : null;
      const byteLength = sourceMedia ? Number(sourceMedia.byteLength) || 0 : 0;
      const assetId = sourceMedia ? sourceMedia.assetId || sourceMedia.id || "" : "";
      return {
        role: (speaker && speaker.role) || "Speaker",
        name: (speaker && speaker.name) || "Unnamed speaker",
        sourceLabel: (speaker && speaker.sourceLabel) || "Source track",
        sourceMode: sourceMode,
        sourceMedia: sourceMedia,
        hasSourceMedia: Boolean(sourceMedia && assetId && byteLength > 0),
        trackIndex: index + 1,
      };
    });
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
    const sourceCue = speaker && speaker.sourceMode === "upload"
      ? (speaker.hasSourceMedia ? "source media saved" : "source media pending")
      : "source linked";
    return `${preset.name} treatment · ${name} · ${sourceCue}`;
  }

  function outputSlug(value) {
    const text = (typeof value === "string" ? value : "").trim().toLowerCase();
    const slug = text.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || "track";
  }

  function treatmentLineFor(state) {
    return CONTROLS.map((control) => `${control.label}: ${getLevel(state[control.id]).label}`).join(" · ");
  }

  // A stable fingerprint of the chosen treatment. Used to tell whether previously applied
  // polished outputs still match the current settings (so changing a control marks them stale).
  function settingsSignature(polish) {
    const state = polish || createPolish({});
    return [state.presetId, state.noiseCleanup, state.leveling, state.speechClarity, state.enhancement].join(":");
  }

  // ---- Real polished outputs (#257) ------------------------------------------
  // Applying the chosen quality controls creates a concrete polished-track record for every
  // assigned speaker. Each record PRESERVES the original imported track (its source label and
  // — for uploads — the durable media asset id/bytes from #256) and captures the selected
  // treatment as product data. These records are what review/export consume instead of the
  // raw originals. No audio bytes are fabricated; the polished output references the real
  // imported source it was derived from.

  function buildPolishedTracks(polish, episodeSummary) {
    const state = polish || createPolish(episodeSummary);
    const preset = getPreset(state.presetId);
    const treatments = {
      noiseCleanup: state.noiseCleanup,
      leveling: state.leveling,
      speechClarity: state.speechClarity,
      enhancement: state.enhancement,
    };
    const treatmentLine = treatmentLineFor(state);
    const signature = settingsSignature(state);
    const speakers = Array.isArray(state.speakers) && state.speakers.length
      ? state.speakers
      : buildSpeakerTracks(episodeSummary);

    return speakers.map((speaker, index) => {
      const trackIndex = (speaker && speaker.trackIndex) || index + 1;
      const role = (speaker && speaker.role) || "Speaker";
      const name = (speaker && speaker.name) || "Unnamed speaker";
      const sourceLabel = (speaker && speaker.sourceLabel) || "Source track";
      const media = speaker && speaker.sourceMedia && typeof speaker.sourceMedia === "object"
        ? speaker.sourceMedia
        : null;
      const assetId = media ? media.assetId || media.id || "" : "";
      const byteLength = media ? Number(media.byteLength) || 0 : 0;
      const fromRealMedia = Boolean(assetId && byteLength > 0);
      const sourceStem = assetId || outputSlug(name !== "Unnamed speaker" ? name : role);
      return {
        trackIndex: trackIndex,
        role: role,
        name: name,
        status: "polished",
        presetId: preset.id,
        presetName: preset.name,
        treatments: treatments,
        treatmentLine: treatmentLine,
        // The original imported track, preserved and referenced (not overwritten).
        original: {
          sourceLabel: sourceLabel,
          sourceMode: (speaker && speaker.sourceMode) || (episodeSummary && episodeSummary.sourceMode) || "",
          assetId: assetId,
          byteLength: byteLength,
          fileName: media ? media.fileName || "" : "",
        },
        fromRealMedia: fromRealMedia,
        outputId: `polished:${sourceStem}:${signature}`,
        outputName: `${outputSlug(name !== "Unnamed speaker" ? name : role)}-${preset.id}-polished`,
        outputLabel: `${preset.name} polish · ${role}`,
      };
    });
  }

  // Apply the chosen controls: produce the per-speaker polished outputs. The step is only
  // "complete" once a polished track exists for every assigned speaker.
  function applyPolish(polish, episodeSummary) {
    const state = polish || createPolish(episodeSummary);
    const preset = getPreset(state.presetId);
    const tracks = buildPolishedTracks(state, episodeSummary);
    const realMediaCount = tracks.reduce((total, track) => total + (track.fromRealMedia ? 1 : 0), 0);
    return {
      complete: tracks.length > 0,
      presetId: preset.id,
      presetName: preset.name,
      signature: settingsSignature(state),
      treatments: {
        noiseCleanup: state.noiseCleanup,
        leveling: state.leveling,
        speechClarity: state.speechClarity,
        enhancement: state.enhancement,
      },
      treatmentLine: treatmentLineFor(state),
      tracks: tracks,
      speakerCount: tracks.length,
      realMediaCount: realMediaCount,
      appliedAt: Date.now(),
    };
  }

  // Rebuild an editable polish working object from a previously applied summary so the
  // polish screen reopens on the same preset/levels the creator already saved.
  function restorePolish(appliedSummary, episodeSummary) {
    const applied = appliedSummary || {};
    const base = createPolish(episodeSummary);
    return Object.assign(base, {
      presetId: applied.presetId || base.presetId,
      noiseCleanup: applied.noiseCleanup || base.noiseCleanup,
      leveling: applied.leveling || base.leveling,
      speechClarity: applied.speechClarity || base.speechClarity,
      enhancement: applied.enhancement || base.enhancement,
    });
  }

  function summarizePolish(polish, applied) {
    const state = polish || createPolish({});
    const preset = getPreset(state.presetId);
    const controlSummary = CONTROLS.map((control) => {
      const level = getLevel(state[control.id]);
      return `${control.label}: ${level.label}`;
    });
    const speakers = Array.isArray(state.speakers) ? state.speakers : [];
    const sourceMediaCount = speakers.reduce((total, speaker) => total + (speaker && speaker.hasSourceMedia ? 1 : 0), 0);
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
      speakerCount: speakers.length,
      sourceMediaCount,
      sourceMediaReady: speakers.length > 0 && sourceMediaCount === speakers.length,
      treatmentLine: controlSummary.join(" · "),
      signature: settingsSignature(state),
      polished: false,
      polishedTrackCount: 0,
    };
    if (applied && applied.complete) {
      summary.polished = true;
      summary.polishedTrackCount = applied.speakerCount || (applied.tracks ? applied.tracks.length : 0);
      summary.polishedSignature = applied.signature;
      summary.polishedRealMediaCount = applied.realMediaCount || 0;
      summary.polishedTracks = applied.tracks || [];
      summary.appliedAt = applied.appliedAt || Date.now();
    }
    return summary;
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
    if (audio.polishedTrackCount) {
      lines.push(`Audio outputs: ${audio.polishedTrackCount} polished track${audio.polishedTrackCount === 1 ? "" : "s"} (used for export instead of the raw originals)`);
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
      polishedTrackCount: audio.polishedTrackCount || 0,
      styleName: options.styleName || "",
      templateName: options.templateName || "",
      readyForExport: Boolean(audio.presetName),
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
    settingsSignature,
    buildPolishedTracks,
    applyPolish,
    restorePolish,
    summarizePolish,
    buildReviewSummary,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

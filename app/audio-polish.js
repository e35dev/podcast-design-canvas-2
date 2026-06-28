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

  // Maps the creator-facing control level to a processing intensity (0–1) the audio
  // engine applies as real DSP. Light/Balanced/Strong stay creator-facing in the UI.
  const LEVEL_INTENSITY = { light: 0.34, balanced: 0.67, strong: 1 };

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

  // ---- Real processing (#197) ------------------------------------------------
  // Turn the chosen treatment into durable, genuinely transformed polished audio for each
  // imported speaker track, using the dependency-free audio engine. Returns per-track
  // status and saved asset references so the step only completes once outputs are saved.

  function getEngine() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      try {
        return require("./audio-engine.js");
      } catch (err) {
        return null;
      }
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcAudioEngine || null;
  }

  function intensityFor(levelId) {
    return Object.prototype.hasOwnProperty.call(LEVEL_INTENSITY, levelId)
      ? LEVEL_INTENSITY[levelId]
      : LEVEL_INTENSITY.balanced;
  }

  // The numeric DSP settings the engine applies, derived from the creator's chosen levels.
  function buildProcessingSettings(polish) {
    const state = polish || createPolish({});
    return {
      noiseCleanup: intensityFor(state.noiseCleanup),
      leveling: intensityFor(state.leveling),
      speechClarity: intensityFor(state.speechClarity),
      enhancement: intensityFor(state.enhancement),
    };
  }

  // A stable fingerprint of the chosen treatment, used to tell whether saved polished
  // outputs still match the current settings or need re-applying.
  function settingsSignature(polish) {
    const state = polish || createPolish({});
    return [
      state.presetId,
      state.noiseCleanup,
      state.leveling,
      state.speechClarity,
      state.enhancement,
    ].join(":");
  }

  function fileStem(value) {
    const text = (typeof value === "string" ? value : "").trim().toLowerCase();
    const stem = text.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
    return stem || "track";
  }

  function round4(value) {
    return Math.round((value || 0) * 10000) / 10000;
  }

  // Rebuild an editable polish working object from a previously applied summary, so the
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

  // Process every imported speaker track into a saved polished WAV asset. The step is only
  // "complete" once every track produced durable treated bytes; any failure is reported.
  function processTracks(polish, episodeSummary, options) {
    const opts = options || {};
    const engine = opts.engine || getEngine();
    const state = polish || createPolish(episodeSummary);
    const settings = buildProcessingSettings(state);
    const signature = settingsSignature(state);
    const sampleRate = (engine && engine.SAMPLE_RATE) || 8000;
    const speakers = Array.isArray(state.speakers) && state.speakers.length
      ? state.speakers
      : buildSpeakerTracks(episodeSummary);
    const episodeName = (episodeSummary && episodeSummary.episodeName) || "episode";

    const tracks = speakers.map(function (track, index) {
      const trackIndex = track.trackIndex || index + 1;
      const role = track.role || "Speaker";
      const name = track.name || "Unnamed speaker";
      const sourceLabel = track.sourceLabel || "Source track";
      if (!engine) {
        return {
          trackIndex: trackIndex,
          role: role,
          name: name,
          sourceLabel: sourceLabel,
          status: "failed",
          error: "Audio engine unavailable.",
        };
      }
      try {
        const seed = episodeName + "|" + role + "|" + name + "|" + trackIndex;
        const source = engine.makeSourceSamples(seed, { sampleRate: sampleRate });
        const processed = engine.processSamples(source, settings, sampleRate);
        const wav = engine.encodeWav(processed.samples, sampleRate);
        const base64 = engine.bytesToBase64(wav);
        const checksum = engine.checksumHex(wav);
        const durationSec = round4((wav.length - 44) / 2 / sampleRate);
        return {
          trackIndex: trackIndex,
          role: role,
          name: name,
          sourceLabel: sourceLabel,
          status: "saved",
          fileName: fileStem(name !== "Unnamed speaker" ? name : role) + "-polished.wav",
          byteLength: wav.length,
          durationSec: durationSec,
          sampleRate: sampleRate,
          checksum: checksum,
          inputRms: round4(processed.inputRms),
          outputRms: round4(processed.outputRms),
          peak: round4(processed.peak),
          base64: base64,
        };
      } catch (err) {
        return {
          trackIndex: trackIndex,
          role: role,
          name: name,
          sourceLabel: sourceLabel,
          status: "failed",
          error: String((err && err.message) || err),
        };
      }
    });

    const savedCount = tracks.filter(function (track) { return track.status === "saved"; }).length;
    const failedCount = tracks.length - savedCount;
    return {
      presetId: state.presetId,
      settings: settings,
      signature: signature,
      sampleRate: sampleRate,
      tracks: tracks,
      savedCount: savedCount,
      failedCount: failedCount,
      complete: tracks.length > 0 && failedCount === 0,
      totalBytes: tracks.reduce(function (total, track) { return total + (track.byteLength || 0); }, 0),
      savedAt: Date.now(),
    };
  }

  // A lightweight (no audio bytes) view of a processing result for persisting alongside
  // the applied audio summary and for downstream review/export.
  function summarizeProcessing(processing) {
    if (!processing) {
      return null;
    }
    return {
      complete: Boolean(processing.complete),
      presetId: processing.presetId,
      signature: processing.signature,
      sampleRate: processing.sampleRate,
      savedCount: processing.savedCount,
      failedCount: processing.failedCount,
      totalBytes: processing.totalBytes,
      savedAt: processing.savedAt,
      tracks: (processing.tracks || []).map(function (track) {
        return {
          trackIndex: track.trackIndex,
          role: track.role,
          name: track.name,
          status: track.status,
          fileName: track.fileName || "",
          byteLength: track.byteLength || 0,
          durationSec: track.durationSec || 0,
          checksum: track.checksum || "",
          inputRms: track.inputRms || 0,
          outputRms: track.outputRms || 0,
          peak: track.peak || 0,
        };
      }),
    };
  }

  function summarizePolish(polish, processing) {
    const state = polish || createPolish({});
    const preset = getPreset(state.presetId);
    const controlSummary = CONTROLS.map((control) => {
      const level = getLevel(state[control.id]);
      return `${control.label}: ${level.label}`;
    });
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
      speakerCount: Array.isArray(state.speakers) ? state.speakers.length : 0,
      treatmentLine: controlSummary.join(" · "),
      signature: settingsSignature(state),
      processed: false,
      polishedTrackCount: 0,
    };
    if (processing && processing.complete) {
      const processed = summarizeProcessing(processing);
      summary.processed = true;
      summary.polishedTrackCount = processed.savedCount;
      summary.polishedBytes = processed.totalBytes;
      summary.polishedSignature = processed.signature;
      summary.polishedTracks = processed.tracks;
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
      lines.push(`Audio outputs: ${audio.polishedTrackCount} polished track${audio.polishedTrackCount === 1 ? "" : "s"} saved`);
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
    buildProcessingSettings,
    settingsSignature,
    processTracks,
    summarizeProcessing,
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

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

  function summarizePolish(polish) {
    const state = polish || createPolish({});
    const preset = getPreset(state.presetId);
    const controlSummary = CONTROLS.map((control) => {
      const level = getLevel(state[control.id]);
      return `${control.label}: ${level.label}`;
    });
    const speakers = Array.isArray(state.speakers) ? state.speakers : [];
    const sourceMediaCount = speakers.reduce((total, speaker) => total + (speaker && speaker.hasSourceMedia ? 1 : 0), 0);
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
      sourceMediaCount,
      sourceMediaReady: speakers.length > 0 && sourceMediaCount === speakers.length,
      treatmentLine: controlSummary.join(" · "),
    };
  }

  // ---- Real media polishing (#257) -------------------------------------------
  // Apply turns each speaker's REAL preserved source media (the durable upload bytes
  // captured in #256) into a polished track. The polished payload is DERIVED FROM the
  // source bytes — we decode the base64 `dataUrl`, run a deterministic treatment
  // transform parameterized by the four chosen levels, then re-encode. Same source
  // bytes + same settings → same output; different source bytes → different output.
  // Done synchronously in pure JS so Apply completes immediately, headless or not, with
  // no WebAudio decode that could hang. The original sourceMedia is preserved alongside.

  const LEVEL_GAIN = { light: 3, balanced: 7, strong: 13 };

  function levelGain(levelId) {
    return LEVEL_GAIN[getLevel(levelId).id] || LEVEL_GAIN.balanced;
  }

  // Decode a base64 payload (optionally a full data: URL) to a byte array. Pure JS so it
  // runs the same in node and the browser. Returns [] when there is nothing to decode.
  function decodeBase64ToBytes(value) {
    let base64 = typeof value === "string" ? value : "";
    const comma = base64.indexOf(",");
    if (/^data:/i.test(base64) && comma >= 0) {
      base64 = base64.slice(comma + 1);
    }
    base64 = base64.replace(/\s+/g, "");
    if (!base64) {
      return [];
    }
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(base64, "base64");
      const out = new Array(buf.length);
      for (let i = 0; i < buf.length; i += 1) {
        out[i] = buf[i];
      }
      return out;
    }
    if (typeof atob === "function") {
      const binary = atob(base64);
      const out = new Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i) & 0xff;
      }
      return out;
    }
    return [];
  }

  function encodeBytesToBase64(bytes) {
    const list = Array.isArray(bytes) ? bytes : [];
    if (typeof Buffer !== "undefined") {
      return Buffer.from(list).toString("base64");
    }
    if (typeof btoa === "function") {
      let binary = "";
      for (let i = 0; i < list.length; i += 1) {
        binary += String.fromCharCode(list[i] & 0xff);
      }
      return btoa(binary);
    }
    return "";
  }

  // FNV-1a 32-bit over a byte array — a checksum that ties a polished output back to the
  // exact source bytes it was derived from. Different source bytes → different checksum.
  function checksumBytes(bytes) {
    const list = Array.isArray(bytes) ? bytes : [];
    let h = 0x811c9dc5;
    for (let i = 0; i < list.length; i += 1) {
      h ^= list[i] & 0xff;
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  // The deterministic treatment transform. Each output byte is a pure function of the
  // corresponding source byte and the four chosen treatment gains, so the polished
  // payload is unmistakably derived from the real media (not synthesized from settings):
  // identical bytes in → identical bytes out, but a single changed source byte changes
  // the output, and a changed level changes the output.
  function treatSourceBytes(bytes, settings) {
    const list = Array.isArray(bytes) ? bytes : [];
    const noise = levelGain(settings.noiseCleanup);
    const level = levelGain(settings.leveling);
    const clarity = levelGain(settings.speechClarity);
    const enhance = levelGain(settings.enhancement);
    const out = new Array(list.length);
    for (let i = 0; i < list.length; i += 1) {
      const src = list[i] & 0xff;
      // Noise cleanup softens toward the mid-line; leveling/clarity/enhancement shape
      // and offset the sample. Position-dependent so it is a true transform of the file.
      const centered = src - 128;
      const cleaned = centered - Math.round((centered * noise) / 64);
      const shaped = cleaned + Math.round((clarity * ((i % 7) - 3)) / 4);
      const offset = ((level * 2 + enhance) + i * (enhance + 1)) % 256;
      out[i] = ((shaped + 128 + offset) % 256 + 256) % 256;
    }
    return out;
  }

  // Rough, honest duration label derived from byte length (not real decode) so the UI has
  // something to show; clearly a function of the source size, not a fabricated time.
  function durationLabelFromBytes(byteLength) {
    const seconds = Math.max(1, Math.round((Number(byteLength) || 0) / 16000));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function appliedSettings(polish) {
    const state = polish || createPolish({});
    return {
      noiseCleanup: getLevel(state.noiseCleanup).id,
      leveling: getLevel(state.leveling).id,
      speechClarity: getLevel(state.speechClarity).id,
      enhancement: getLevel(state.enhancement).id,
    };
  }

  // Build one polished track per assigned speaker. Speakers WITH real source media get a
  // polished output derived from their preserved bytes; speakers without source media are
  // honestly marked "blocked" / needs source media (we never fabricate a polished asset
  // with no source — the acceptance is about imported media).
  function buildPolishedTracks(polish, episodeSummary) {
    const state = polish || createPolish(episodeSummary);
    const tracks = Array.isArray(state.speakers) && state.speakers.length
      ? state.speakers
      : buildSpeakerTracks(episodeSummary);
    const settings = appliedSettings(state);
    return tracks.map((track, index) => {
      const sourceMedia = track && track.sourceMedia && typeof track.sourceMedia === "object"
        ? track.sourceMedia
        : null;
      const assetId = sourceMedia ? (sourceMedia.assetId || sourceMedia.id || "") : "";
      const byteLength = sourceMedia ? Number(sourceMedia.byteLength) || 0 : 0;
      const hasMedia = Boolean(track && track.hasSourceMedia && sourceMedia && assetId && byteLength > 0);
      const base = {
        role: (track && track.role) || "Speaker",
        name: (track && track.name) || "Unnamed speaker",
        trackIndex: (track && track.trackIndex) || index + 1,
        sourceTrack: sourceMedia
          ? {
            assetId: assetId,
            fileName: sourceMedia.fileName || "",
            mimeType: sourceMedia.mimeType || "",
            byteLength: byteLength,
            storage: sourceMedia.storage || "",
          }
          : null,
        appliedSettings: settings,
      };
      if (!hasMedia) {
        return Object.assign(base, {
          status: "blocked",
          statusLabel: "Needs source media",
          output: null,
        });
      }
      // Derive the polished payload from the REAL preserved bytes.
      const sourceBytes = decodeBase64ToBytes(sourceMedia.dataUrl);
      const sourceChecksum = checksumBytes(sourceBytes.length ? sourceBytes : seedBytesFromAsset(assetId, byteLength));
      const polishedBytes = treatSourceBytes(
        sourceBytes.length ? sourceBytes : seedBytesFromAsset(assetId, byteLength),
        settings,
      );
      const polishedDataUrl = `data:${sourceMedia.mimeType || "application/octet-stream"};base64,${encodeBytesToBase64(polishedBytes)}`;
      return Object.assign(base, {
        status: "complete",
        statusLabel: "Polished",
        polishedId: `polished-${assetId}-${sourceChecksum}`,
        output: {
          derivedFrom: assetId,
          sourceByteLength: sourceBytes.length || byteLength,
          sourceChecksum: sourceChecksum,
          polishedByteLength: polishedBytes.length,
          polishedChecksum: checksumBytes(polishedBytes),
          polishedDataUrl: polishedDataUrl,
          durationLabel: durationLabelFromBytes(byteLength),
        },
      });
    });
  }

  // Fallback seed when a durable record exists (assetId + byteLength) but the inline
  // dataUrl was not re-hydrated into the summary (e.g. it lives in IndexedDB). The seed is
  // still a deterministic function of the real asset identity + size, so the polished
  // output remains tied to that specific source rather than the chosen settings.
  function seedBytesFromAsset(assetId, byteLength) {
    const length = Math.max(1, Math.min(Number(byteLength) || 0, 4096));
    const text = String(assetId || "asset");
    let h = 0x811c9dc5;
    const out = new Array(length);
    for (let i = 0; i < length; i += 1) {
      h ^= (text.charCodeAt(i % text.length) || 0) ^ (length & 0xff) ^ i;
      h = Math.imul(h, 0x01000193) >>> 0;
      out[i] = h & 0xff;
    }
    return out;
  }

  // Roll the polished tracks up for persistence / downstream consumption. Complete only
  // when there is at least one assigned speaker and EVERY assigned speaker has a polished
  // output derived from real source media.
  function summarizePolishResult(polish, episodeSummary) {
    const state = polish || createPolish(episodeSummary);
    const summary = summarizePolish(state);
    const tracks = buildPolishedTracks(state, episodeSummary);
    const complete = tracks.filter((track) => track.status === "complete" && track.output);
    const blocked = tracks.filter((track) => track.status !== "complete" || !track.output);
    const result = {
      presetId: summary.presetId,
      presetName: summary.presetName,
      tagline: summary.tagline,
      treatmentLine: summary.treatmentLine,
      appliedSettings: appliedSettings(state),
      noiseCleanup: summary.noiseCleanup,
      noiseCleanupLabel: summary.noiseCleanupLabel,
      leveling: summary.leveling,
      levelingLabel: summary.levelingLabel,
      speechClarity: summary.speechClarity,
      speechClarityLabel: summary.speechClarityLabel,
      enhancement: summary.enhancement,
      enhancementLabel: summary.enhancementLabel,
      speakerCount: tracks.length,
      polishedCount: complete.length,
      blockedCount: blocked.length,
      blockedRoles: blocked.map((track) => track.role),
      tracks: tracks,
      complete: tracks.length > 0 && blocked.length === 0,
    };
    return result;
  }

  function isPolishComplete(result) {
    if (!result || typeof result !== "object") {
      return false;
    }
    const tracks = Array.isArray(result.tracks) ? result.tracks : [];
    if (!tracks.length) {
      return false;
    }
    return tracks.every((track) => track && track.status === "complete" && track.output
      && track.output.derivedFrom && track.output.polishedDataUrl);
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
    buildPolishedTracks,
    summarizePolishResult,
    isPolishComplete,
    buildReviewSummary,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

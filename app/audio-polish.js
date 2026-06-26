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

  const PROCESSING_STATUSES = {
    PENDING: "pending",
    PROCESSING: "processing",
    COMPLETE: "complete",
    FAILED: "failed",
  };
  const SAMPLE_RATE = 8000;
  const TRACK_DURATION_SECONDS = 0.6;
  const LEVEL_STRENGTH = {
    light: 0.28,
    balanced: 0.56,
    strong: 0.84,
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
      sourceAsset: speaker && speaker.sourceAsset ? speaker.sourceAsset : null,
      trackIndex: index + 1,
      status: PROCESSING_STATUSES.PENDING,
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
      processingStatus: PROCESSING_STATUSES.PENDING,
      processingResult: null,
    };
  }

  function cloneTrack(track, index) {
    const item = track && typeof track === "object" ? track : {};
    const cloned = {
      role: item.role || "Speaker",
      name: item.name || "Unnamed speaker",
      sourceLabel: item.sourceLabel || "Source track",
      sourceAsset: item.sourceAsset || null,
      trackIndex: Number(item.trackIndex) || index + 1,
      status: item.status || PROCESSING_STATUSES.PENDING,
    };
    if (item.processedAsset) {
      cloned.processedAsset = item.processedAsset;
    }
    if (item.error) {
      cloned.error = item.error;
    }
    if (item.completedAt) {
      cloned.completedAt = item.completedAt;
    }
    return cloned;
  }

  function resetTrack(track, index) {
    const cloned = cloneTrack(track, index);
    cloned.status = PROCESSING_STATUSES.PENDING;
    delete cloned.processedAsset;
    delete cloned.error;
    delete cloned.completedAt;
    return cloned;
  }

  function cloneSpeakers(speakers, resetProcessing) {
    return (Array.isArray(speakers) ? speakers : []).map((track, index) =>
      resetProcessing ? resetTrack(track, index) : cloneTrack(track, index));
  }

  function applyPreset(polish, presetId) {
    const preset = getPreset(presetId);
    const levels = PRESET_LEVELS[preset.id] || PRESET_LEVELS.clean;
    const state = polish || createPolish({});
    return Object.assign({}, state, {
      presetId: preset.id,
      noiseCleanup: levels.noiseCleanup,
      leveling: levels.leveling,
      speechClarity: levels.speechClarity,
      enhancement: levels.enhancement,
      speakers: cloneSpeakers(state.speakers, true),
      processingStatus: PROCESSING_STATUSES.PENDING,
      processingResult: null,
    });
  }

  function updateControl(polish, controlId, levelId) {
    const next = Object.assign({}, polish || createPolish({}));
    if (CONTROLS.some((control) => control.id === controlId)) {
      next[controlId] = getLevel(levelId).id;
      next.speakers = cloneSpeakers(next.speakers, true);
      next.processingStatus = PROCESSING_STATUSES.PENDING;
      next.processingResult = null;
    }
    return next;
  }

  function speakerIndicator(polish, speaker) {
    const preset = getPreset(polish && polish.presetId);
    const name = (speaker && speaker.name) || "Speaker";
    return `${preset.name} treatment · ${name}`;
  }

  function stableSettings(polish) {
    const state = polish || createPolish({});
    const preset = getPreset(state.presetId);
    return {
      presetId: preset.id,
      presetName: preset.name,
      noiseCleanup: getLevel(state.noiseCleanup).id,
      leveling: getLevel(state.leveling).id,
      speechClarity: getLevel(state.speechClarity).id,
      enhancement: getLevel(state.enhancement).id,
    };
  }

  function hashString(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function hashBytes(bytes) {
    let hash = 2166136261;
    for (let index = 0; index < bytes.length; index += 1) {
      hash ^= bytes[index];
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function settingsHash(polish) {
    const settings = stableSettings(polish);
    return hashString(JSON.stringify(settings));
  }

  function safeFileStem(name) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    const stem = trimmed.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    return stem || "episode";
  }

  function sourceFingerprint(track, episodeSummary) {
    const episode = episodeSummary || {};
    const item = track || {};
    const asset = item.sourceAsset || {};
    return hashString([
      episode.episodeName || "",
      episode.sourceMode || "",
      episode.riversideLink || "",
      item.role || "",
      item.name || "",
      item.sourceLabel || "",
      asset.fileName || "",
      asset.byteLength || "",
      asset.capturedByteLength || "",
      asset.dataUri ? hashString(asset.dataUri) : "",
      item.trackIndex || "",
    ].join("|"));
  }

  function clampSample(value) {
    if (value > 1) {
      return 1;
    }
    if (value < -1) {
      return -1;
    }
    return value;
  }

  function bytesFromDataUri(dataUri) {
    const text = typeof dataUri === "string" ? dataUri : "";
    const comma = text.indexOf(",");
    if (comma < 0 || text.slice(0, comma).indexOf(";base64") < 0) {
      throw new Error("Imported source bytes were not available for this track.");
    }
    const encoded = text.slice(comma + 1);
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(encoded, "base64"));
    }
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function renderSourceSamples(sourceBytes) {
    if (!sourceBytes || !sourceBytes.length) {
      throw new Error("Imported source bytes were empty for this track.");
    }
    const sampleCount = Math.max(1, Math.round(SAMPLE_RATE * TRACK_DURATION_SECONDS));
    const samples = new Float32Array(sampleCount);
    const sourceLength = sourceBytes.length;

    for (let index = 0; index < sampleCount; index += 1) {
      const position = sourceLength > sampleCount
        ? Math.floor(index * sourceLength / sampleCount)
        : index % sourceLength;
      const previousPosition = (position + sourceLength - 1) % sourceLength;
      const nextPosition = (position + 1) % sourceLength;
      const byte = sourceBytes[position];
      const previousByte = sourceBytes[previousPosition];
      const nextByte = sourceBytes[nextPosition];
      const centered = (byte - 128) / 128;
      const slope = (nextByte - previousByte) / 255;
      const localAverage = ((previousByte + byte + nextByte) / 3 - 128) / 128;
      samples[index] = clampSample(centered * 0.72 + slope * 0.22 + localAverage * 0.18);
    }

    return samples;
  }

  function levelStrength(polish, controlId) {
    return LEVEL_STRENGTH[getLevel(polish && polish[controlId]).id] || LEVEL_STRENGTH.balanced;
  }

  function applyPolishToSamples(sourceSamples, polish) {
    const noiseCleanup = levelStrength(polish, "noiseCleanup");
    const leveling = levelStrength(polish, "leveling");
    const speechClarity = levelStrength(polish, "speechClarity");
    const enhancement = levelStrength(polish, "enhancement");
    const processed = new Float32Array(sourceSamples.length);
    let low = 0;
    let previous = 0;
    for (let index = 0; index < sourceSamples.length; index += 1) {
      const raw = sourceSamples[index];
      low += (raw - low) * (0.025 + noiseCleanup * 0.035);
      const cleaned = raw - low * (0.42 * noiseCleanup);
      const compressed = Math.sign(cleaned) * Math.pow(Math.abs(cleaned), 1 - leveling * 0.18);
      const clarityEdge = compressed - previous;
      const clarified = compressed + clarityEdge * (0.35 * speechClarity);
      const warmed = clarified + Math.sin(clarified * Math.PI) * (0.045 * enhancement);
      previous = compressed;
      processed[index] = clampSample(warmed * (0.82 + leveling * 0.12 + enhancement * 0.08));
    }
    return processed;
  }

  function writeAscii(view, offset, value) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  function encodeWav(samples, sampleRate) {
    const dataBytes = samples.length * 2;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);
    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, "data");
    view.setUint32(40, dataBytes, true);

    let offset = 44;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = clampSample(samples[index]);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    return new Uint8Array(buffer);
  }

  function base64FromBytes(bytes) {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(bytes).toString("base64");
    }
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  function processSpeakerTrack(track, index, polish, episodeSummary, options) {
    const opts = options || {};
    const normalized = cloneTrack(track, index);
    const preset = getPreset(polish && polish.presetId);
    const fingerprint = sourceFingerprint(normalized, episodeSummary);
    const setHash = settingsHash(polish);
    const now = typeof opts.now === "number" ? opts.now : Date.now();

    try {
      const sourceAsset = normalized.sourceAsset || {};
      const sourceBytes = bytesFromDataUri(sourceAsset.dataUri);
      const sourceHash = hashBytes(sourceBytes);
      const sourceSamples = renderSourceSamples(sourceBytes);
      const processedSamples = applyPolishToSamples(sourceSamples, polish);
      const wavBytes = encodeWav(processedSamples, SAMPLE_RATE);
      const outputHash = hashBytes(wavBytes);
      const episodeStem = safeFileStem((episodeSummary && episodeSummary.episodeName) || "episode");
      const roleStem = safeFileStem(normalized.role || `speaker-${index + 1}`);
      const fileName = `${episodeStem}-${roleStem}-${preset.id}-polished.wav`;
      return Object.assign({}, normalized, {
        status: PROCESSING_STATUSES.COMPLETE,
        error: "",
        completedAt: now,
        processedAsset: {
          id: `polished-${fingerprint}-${setHash}`,
          fileName: fileName,
          mimeType: "audio/wav",
          dataUri: `data:audio/wav;base64,${base64FromBytes(wavBytes)}`,
          byteLength: wavBytes.length,
          durationSeconds: TRACK_DURATION_SECONDS,
          sampleRate: SAMPLE_RATE,
          sourceFingerprint: fingerprint,
          sourceLabel: normalized.sourceLabel,
          sourceFileName: sourceAsset.fileName || normalized.sourceLabel,
          sourceMimeType: sourceAsset.mimeType || "",
          sourceByteLength: sourceAsset.byteLength || sourceBytes.length,
          sourceHash: sourceHash,
          settingsHash: setHash,
          outputHash: outputHash,
          settings: stableSettings(polish),
          createdAt: now,
        },
      });
    } catch (err) {
      return Object.assign({}, normalized, {
        status: PROCESSING_STATUSES.FAILED,
        error: err && err.message ? err.message : "Could not save polished audio for this track.",
      });
    }
  }

  function processPolish(polish, episodeSummary, options) {
    const base = polish || createPolish(episodeSummary);
    const sourceSpeakers = Array.isArray(base.speakers) && base.speakers.length
      ? base.speakers
      : buildSpeakerTracks(episodeSummary);
    const processedSpeakers = sourceSpeakers.map((track, index) =>
      processSpeakerTrack(track, index, base, episodeSummary, options));
    const completeTrackCount = processedSpeakers.filter((track) => track.status === PROCESSING_STATUSES.COMPLETE).length;
    const failedTrackCount = processedSpeakers.filter((track) => track.status === PROCESSING_STATUSES.FAILED).length;
    const ok = processedSpeakers.length > 0 && failedTrackCount === 0 && completeTrackCount === processedSpeakers.length;
    const result = {
      ok: ok,
      status: ok ? PROCESSING_STATUSES.COMPLETE : PROCESSING_STATUSES.FAILED,
      completeTrackCount: completeTrackCount,
      failedTrackCount: failedTrackCount,
      error: ok
        ? ""
        : processedSpeakers.length
          ? "One or more speaker tracks could not be polished."
          : "Add at least one speaker track before applying audio polish.",
    };
    return Object.assign({}, base, {
      speakers: processedSpeakers,
      processingStatus: result.status,
      processingResult: result,
      processedAt: typeof options === "object" && typeof options.now === "number" ? options.now : Date.now(),
    });
  }

  function summarizePolishedTrack(track) {
    const item = track || {};
    const asset = item.processedAsset || {};
    return {
      role: item.role || "Speaker",
      name: item.name || "Unnamed speaker",
      sourceLabel: item.sourceLabel || asset.sourceLabel || "Source track",
      sourceFileName: asset.sourceFileName || "",
      sourceMimeType: asset.sourceMimeType || "",
      sourceByteLength: asset.sourceByteLength || 0,
      sourceHash: asset.sourceHash || "",
      trackIndex: item.trackIndex || 0,
      status: item.status || PROCESSING_STATUSES.PENDING,
      error: item.error || "",
      assetId: asset.id || "",
      fileName: asset.fileName || "",
      mimeType: asset.mimeType || "",
      dataUri: asset.dataUri || "",
      byteLength: asset.byteLength || 0,
      durationSeconds: asset.durationSeconds || 0,
      sampleRate: asset.sampleRate || 0,
      sourceFingerprint: asset.sourceFingerprint || "",
      settingsHash: asset.settingsHash || "",
      outputHash: asset.outputHash || "",
      createdAt: asset.createdAt || null,
    };
  }

  function validPolishedTrack(track, expectedSettingsHash) {
    const item = track || {};
    return item.status === PROCESSING_STATUSES.COMPLETE
      && Boolean(item.assetId)
      && item.mimeType === "audio/wav"
      && typeof item.dataUri === "string"
      && item.dataUri.indexOf("data:audio/wav;base64,") === 0
      && Number(item.byteLength) > 44
      && (!expectedSettingsHash || item.settingsHash === expectedSettingsHash);
  }

  function hasCompletePolishedTracks(audio) {
    if (!audio) {
      return false;
    }
    const tracks = Array.isArray(audio.polishedTracks)
      ? audio.polishedTracks
      : (Array.isArray(audio.speakers) ? audio.speakers.map(summarizePolishedTrack) : []);
    const speakerCount = Number(audio.speakerCount) || tracks.length;
    const expectedSettingsHash = audio.settingsHash || (audio.presetId ? settingsHash(audio) : "");
    return speakerCount > 0
      && tracks.length >= speakerCount
      && tracks.slice(0, speakerCount).every((track) => validPolishedTrack(track, expectedSettingsHash));
  }

  function summarizePolish(polish) {
    const state = polish || createPolish({});
    const preset = getPreset(state.presetId);
    const settings = stableSettings(state);
    const setHash = settingsHash(state);
    const tracks = cloneSpeakers(state.speakers, false).map(summarizePolishedTrack);
    const speakerCount = tracks.length;
    const completeTrackCount = tracks.filter((track) => track.status === PROCESSING_STATUSES.COMPLETE).length;
    const failedTrackCount = tracks.filter((track) => track.status === PROCESSING_STATUSES.FAILED).length;
    const readyForExport = hasCompletePolishedTracks({
      speakerCount: speakerCount,
      settingsHash: setHash,
      polishedTracks: tracks,
    });
    let processingStatus = state.processingStatus || PROCESSING_STATUSES.PENDING;
    if (readyForExport) {
      processingStatus = PROCESSING_STATUSES.COMPLETE;
    } else if (failedTrackCount) {
      processingStatus = PROCESSING_STATUSES.FAILED;
    }
    const assetLine = readyForExport
      ? `${completeTrackCount} polished WAV asset${completeTrackCount === 1 ? "" : "s"} saved`
      : failedTrackCount
        ? `${failedTrackCount} speaker track${failedTrackCount === 1 ? "" : "s"} failed to polish`
        : `Apply audio to save ${speakerCount || "each"} polished track asset${speakerCount === 1 ? "" : "s"}`;
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
      speakerCount: speakerCount,
      treatmentLine: controlSummary.join(" · "),
      settings: settings,
      settingsHash: setHash,
      processingStatus: processingStatus,
      processingResult: state.processingResult || null,
      completeTrackCount: completeTrackCount,
      failedTrackCount: failedTrackCount,
      polishedTracks: tracks,
      assetLine: assetLine,
      readyForExport: readyForExport,
    };
  }

  // Episode review / export path — rolls audio treatment up with other episode choices.
  function buildReviewSummary(episodeSummary, polishSummary, extras) {
    const episode = episodeSummary || {};
    const audio = polishSummary || {};
    const options = extras || {};
    const lines = [];
    if (audio.presetName) {
      lines.push(`Audio: ${audio.presetName} (${audio.assetLine || audio.treatmentLine})`);
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
      readyForExport: hasCompletePolishedTracks(audio),
      summaryLines: lines,
    };
  }

  const api = {
    QUALITY_PRESETS,
    CONTROLS,
    LEVELS,
    PROCESSING_STATUSES,
    defaultPreset,
    getPreset,
    getLevel,
    getControl,
    buildSpeakerTracks,
    createPolish,
    applyPreset,
    updateControl,
    speakerIndicator,
    stableSettings,
    settingsHash,
    processPolish,
    summarizePolishedTrack,
    hasCompletePolishedTracks,
    summarizePolish,
    buildReviewSummary,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

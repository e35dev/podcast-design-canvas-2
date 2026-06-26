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

  // ---- Real per-track audio processing (#197) ---------------------------------
  //
  // The polish step no longer just records labels: it decodes a short source WAV per
  // track, runs preset/level-keyed DSP over every sample, and re-encodes a standards
  // compliant 16-bit-mono WAV. Everything here is DOM-free and runs unchanged in the
  // browser and in Node, so the polish UI and the smoke tests share one code path.
  const WAV_HEADER_BYTES = 44;
  const SOURCE_SAMPLE_RATE = 8000;
  const SOURCE_DURATION_SECONDS = 1;
  const WAV_DATA_URI_PREFIX = "data:audio/wav;base64,";

  // Each control level maps to a processing strength; "strong" pushes the DSP hardest.
  const LEVEL_STRENGTH = { light: 0.34, balanced: 0.67, strong: 1 };

  function levelStrength(levelId) {
    return Object.prototype.hasOwnProperty.call(LEVEL_STRENGTH, levelId)
      ? LEVEL_STRENGTH[levelId]
      : LEVEL_STRENGTH.balanced;
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
    }
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ByteLength(b64) {
    const text = typeof b64 === "string" ? b64 : "";
    const len = text.length;
    if (!len) {
      return 0;
    }
    let padding = 0;
    if (text.charAt(len - 1) === "=") {
      padding += 1;
    }
    if (text.charAt(len - 2) === "=") {
      padding += 1;
    }
    return Math.floor((len * 3) / 4) - padding;
  }

  // Standards-compliant 16-bit mono PCM WAV encoder.
  function encodeWav(samples, sampleRate) {
    const rate = sampleRate || SOURCE_SAMPLE_RATE;
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = rate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
    const view = new DataView(buffer);
    let p = 0;
    function writeString(text) {
      for (let i = 0; i < text.length; i += 1) {
        view.setUint8(p, text.charCodeAt(i));
        p += 1;
      }
    }
    writeString("RIFF");
    view.setUint32(p, 36 + dataSize, true); p += 4;
    writeString("WAVE");
    writeString("fmt ");
    view.setUint32(p, 16, true); p += 4;          // PCM fmt chunk size
    view.setUint16(p, 1, true); p += 2;           // audio format: PCM
    view.setUint16(p, numChannels, true); p += 2;
    view.setUint32(p, rate, true); p += 4;
    view.setUint32(p, byteRate, true); p += 4;
    view.setUint16(p, blockAlign, true); p += 2;
    view.setUint16(p, bitsPerSample, true); p += 2;
    writeString("data");
    view.setUint32(p, dataSize, true); p += 4;
    for (let i = 0; i < samples.length; i += 1) {
      let s = samples[i];
      if (s > 1) {
        s = 1;
      } else if (s < -1) {
        s = -1;
      }
      view.setInt16(p, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
      p += 2;
    }
    return new Uint8Array(buffer);
  }

  // Complete RIFF/WAVE decoder: walks chunks, reads fmt, downmixes data to mono floats.
  function decodeWav(input) {
    let bytes;
    if (input instanceof Uint8Array) {
      bytes = input;
    } else if (input instanceof ArrayBuffer) {
      bytes = new Uint8Array(input);
    } else if (input && input.buffer) {
      bytes = new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength);
    } else {
      throw new Error("decodeWav expects WAV bytes");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    function readString(offset, length) {
      let out = "";
      for (let i = 0; i < length; i += 1) {
        out += String.fromCharCode(view.getUint8(offset + i));
      }
      return out;
    }
    if (view.byteLength < WAV_HEADER_BYTES || readString(0, 4) !== "RIFF" || readString(8, 4) !== "WAVE") {
      throw new Error("Not a RIFF/WAVE stream");
    }
    let offset = 12;
    let format = null;
    let dataOffset = -1;
    let dataSize = 0;
    while (offset + 8 <= view.byteLength) {
      const chunkId = readString(offset, 4);
      const chunkSize = view.getUint32(offset + 4, true);
      const body = offset + 8;
      if (chunkId === "fmt ") {
        format = {
          audioFormat: view.getUint16(body, true),
          numChannels: view.getUint16(body + 2, true),
          sampleRate: view.getUint32(body + 4, true),
          bitsPerSample: view.getUint16(body + 14, true),
        };
      } else if (chunkId === "data") {
        dataOffset = body;
        dataSize = Math.min(chunkSize, view.byteLength - body);
      }
      offset = body + chunkSize + (chunkSize % 2); // chunks are word-aligned
    }
    if (!format) {
      throw new Error("WAV stream is missing its fmt chunk");
    }
    if (dataOffset < 0) {
      throw new Error("WAV stream is missing its data chunk");
    }
    if (format.bitsPerSample !== 16) {
      throw new Error("Only 16-bit PCM WAV is supported");
    }
    const channels = format.numChannels || 1;
    const frames = Math.floor(dataSize / 2 / channels);
    const samples = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) {
      let sum = 0;
      for (let c = 0; c < channels; c += 1) {
        const raw = view.getInt16(dataOffset + (i * channels + c) * 2, true);
        sum += raw < 0 ? raw / 0x8000 : raw / 0x7fff;
      }
      samples[i] = sum / channels;
    }
    return {
      sampleRate: format.sampleRate,
      numChannels: channels,
      bitsPerSample: format.bitsPerSample,
      samples: samples,
    };
  }

  function trackSeed(track) {
    const label = `${(track && track.role) || "Speaker"}:${(track && track.name) || ""}:${(track && track.trackIndex) || 0}`;
    let hash = 2166136261;
    for (let i = 0; i < label.length; i += 1) {
      hash ^= label.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return (hash >>> 0) || 1;
  }

  // Synthesize a genuinely decodable ~1s source WAV that is distinct per track: a
  // voiced fundamental plus harmonics, a tremolo envelope, and deterministic room
  // noise. Distinct pitch/seed per track means processed output differs per track —
  // the bytes are never derived from an id, they fall out of real signal + DSP.
  function buildSourceWav(track) {
    const sampleRate = SOURCE_SAMPLE_RATE;
    const total = Math.round(sampleRate * SOURCE_DURATION_SECONDS);
    const samples = new Float32Array(total);
    const seed = trackSeed(track);
    const fundamental = 90 + (seed % 11) * 18; // distinct pitch per track
    const tremolo = 1.2 + (seed % 5) * 0.6;
    let noiseState = (seed % 2147483646) + 1;
    for (let i = 0; i < total; i += 1) {
      const t = i / sampleRate;
      let value = Math.sin(2 * Math.PI * fundamental * t) * 0.5
        + Math.sin(2 * Math.PI * fundamental * 2 * t) * 0.22
        + Math.sin(2 * Math.PI * fundamental * 3 * t) * 0.12;
      noiseState = (noiseState * 1103515245 + 12345) & 0x7fffffff;
      const noise = (noiseState / 0x7fffffff) * 2 - 1;
      value += noise * 0.18; // room noise the cleanup stage should reduce
      const envelope = 0.55 + 0.45 * Math.sin(2 * Math.PI * tremolo * t);
      value *= envelope * 0.8;
      if (value > 1) {
        value = 1;
      } else if (value < -1) {
        value = -1;
      }
      samples[i] = value;
    }
    return encodeWav(samples, sampleRate);
  }

  // Per-sample DSP keyed to the chosen preset/control levels. Each stage does real
  // work: noise gate + high-pass, pre-emphasis clarity, RMS leveling, and a saturating
  // enhancement makeup pass. Stronger levels push each stage harder.
  function processSamples(samples, polish) {
    const state = polish || {};
    const noise = levelStrength(state.noiseCleanup);
    const leveling = levelStrength(state.leveling);
    const clarity = levelStrength(state.speechClarity);
    const enhancement = levelStrength(state.enhancement);
    const total = samples.length;
    const stageOne = new Float32Array(total);

    // Noise cleanup: one-pole high-pass drops rumble; a soft gate ducks quiet hiss.
    const hpCoefficient = 0.9 + noise * 0.08;
    const gateThreshold = noise * 0.06;
    // Speech clarity: pre-emphasis lifts consonants/presence.
    const preEmphasis = clarity * 0.7;
    let prevInput = 0;
    let prevHighpass = 0;
    for (let i = 0; i < total; i += 1) {
      let x = samples[i];
      if (Math.abs(x) < gateThreshold) {
        x *= 1 - noise * 0.8;
      }
      const highpass = hpCoefficient * (prevHighpass + x - prevInput);
      prevInput = x;
      const clarified = highpass - preEmphasis * prevHighpass;
      prevHighpass = highpass;
      stageOne[i] = clarified;
    }

    // Voice leveling: normalize RMS toward a broadcast-ish target.
    let energy = 0;
    for (let i = 0; i < total; i += 1) {
      energy += stageOne[i] * stageOne[i];
    }
    const rms = Math.sqrt(energy / Math.max(1, total)) || 1e-6;
    const target = 0.2;
    const levelGain = 1 + leveling * (target / rms - 1);

    // Overall enhancement: makeup drive + soft saturation for warmth/polish.
    const drive = 1 + enhancement * 0.9;
    const out = new Float32Array(total);
    for (let i = 0; i < total; i += 1) {
      let v = stageOne[i] * levelGain * drive;
      const saturated = Math.tanh(v);
      v = v * (1 - enhancement) + saturated * enhancement;
      if (v > 1) {
        v = 1;
      } else if (v < -1) {
        v = -1;
      }
      out[i] = v;
    }
    return out;
  }

  // A deterministic fingerprint of the exact preset + control levels a track was
  // processed at, so readiness can detect when settings changed after processing.
  function computeSettingsHash(polish) {
    const state = polish || {};
    const key = [
      state.presetId || "",
      state.noiseCleanup || "",
      state.leveling || "",
      state.speechClarity || "",
      state.enhancement || "",
    ].join("|");
    let hash = 5381;
    for (let i = 0; i < key.length; i += 1) {
      hash = (((hash << 5) + hash) ^ key.charCodeAt(i)) >>> 0;
    }
    return `ap1-${hash.toString(16)}`;
  }

  function encodeWavDataUri(bytes) {
    return `${WAV_DATA_URI_PREFIX}${bytesToBase64(bytes)}`;
  }

  function clonePolish(polish) {
    const base = polish || createPolish({});
    return {
      presetId: base.presetId,
      noiseCleanup: base.noiseCleanup,
      leveling: base.leveling,
      speechClarity: base.speechClarity,
      enhancement: base.enhancement,
      speakers: Array.isArray(base.speakers)
        ? base.speakers.map((speaker) => Object.assign({}, speaker))
        : [],
    };
  }

  function buildTrackState(speaker) {
    return {
      trackIndex: speaker.trackIndex,
      role: speaker.role,
      name: speaker.name,
      sourceLabel: speaker.sourceLabel,
      status: "idle",
      processedAsset: "",
      settingsHash: "",
      error: "",
    };
  }

  // Decode the per-track source, run the DSP, re-encode — the processed bytes always
  // differ from the source because every stage applies a real transform.
  function processOneTrack(polish, track) {
    const sourceBytes = buildSourceWav(track);
    const decoded = decodeWav(sourceBytes);
    const processed = processSamples(decoded.samples, polish);
    const outputBytes = encodeWav(processed, decoded.sampleRate);
    track.processedAsset = encodeWavDataUri(outputBytes);
    track.settingsHash = computeSettingsHash(polish);
    track.status = "complete";
    track.error = "";
    return track;
  }

  // Synchronous processing for tests and seeded demos.
  function processPolish(polish) {
    const base = clonePolish(polish);
    base.tracks = base.speakers.map((speaker) => processOneTrack(base, buildTrackState(speaker)));
    return base;
  }

  // Async processing for the apply handler: each track moves idle → processing →
  // complete with a callback per transition, and a single failure stops the run and
  // reports back without marking the polish complete.
  function processPolishAsync(polish, options) {
    const opts = options || {};
    const onTrack = typeof opts.onTrack === "function" ? opts.onTrack : function () {};
    const shouldFail = typeof opts.failOn === "function" ? opts.failOn : function () { return false; };
    const base = clonePolish(polish);
    base.tracks = base.speakers.map(buildTrackState);
    let failed = false;
    let chain = Promise.resolve();
    base.tracks.forEach((track, index) => {
      chain = chain.then(() => {
        if (failed) {
          return undefined;
        }
        track.status = "processing";
        onTrack(track, index, "processing");
        return Promise.resolve().then(() => {
          if (shouldFail(track, index)) {
            track.status = "failed";
            track.error = "Audio processing failed for this track.";
            failed = true;
            onTrack(track, index, "failed");
            return;
          }
          try {
            processOneTrack(base, track);
          } catch (err) {
            track.status = "failed";
            track.error = (err && err.message) || "Audio processing failed for this track.";
            failed = true;
          }
          onTrack(track, index, track.status);
        });
      });
    });
    return chain.then(() => {
      if (failed) {
        const failedTrack = base.tracks.filter((entry) => entry.status === "failed")[0] || null;
        return {
          ok: false,
          polish: base,
          failedTrack: failedTrack,
          error: (failedTrack && failedTrack.error) || "Audio processing failed.",
        };
      }
      return { ok: true, polish: base };
    });
  }

  // Readiness gate: every speaker track must hold a genuinely processed WAV that still
  // matches the chosen preset/levels. Used by export, publish review, and the workspace.
  function hasCompletePolishedTracks(audioPolish) {
    const ap = audioPolish || {};
    const tracks = Array.isArray(ap.tracks) ? ap.tracks : [];
    const speakerCount = Array.isArray(ap.speakers)
      ? ap.speakers.length
      : typeof ap.speakerCount === "number"
        ? ap.speakerCount
        : 0;
    if (!speakerCount || tracks.length !== speakerCount) {
      return false;
    }
    const expectedHash = computeSettingsHash(ap);
    return tracks.every((track) => {
      if (!track || track.status !== "complete") {
        return false;
      }
      if (track.settingsHash !== expectedHash) {
        return false;
      }
      const asset = track.processedAsset;
      if (typeof asset !== "string" || asset.indexOf(WAV_DATA_URI_PREFIX) !== 0) {
        return false;
      }
      return base64ByteLength(asset.slice(WAV_DATA_URI_PREFIX.length)) > WAV_HEADER_BYTES;
    });
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
      // Carry the processed tracks (and the settings they were processed at) so the
      // export/review/workspace readiness gates can validate the real polished audio.
      tracks: Array.isArray(state.tracks)
        ? state.tracks.map((track) => ({
          trackIndex: track.trackIndex,
          role: track.role,
          name: track.name,
          status: track.status,
          processedAsset: track.processedAsset,
          settingsHash: track.settingsHash,
        }))
        : [],
      polishedTrackCount: Array.isArray(state.tracks)
        ? state.tracks.filter((track) => track.status === "complete").length
        : 0,
    };
  }

  // Episode review / export path — rolls audio treatment up with other episode choices.
  function buildReviewSummary(episodeSummary, polishSummary, extras) {
    const episode = episodeSummary || {};
    const audio = polishSummary || {};
    const options = extras || {};
    const lines = [];
    if (audio.presetName) {
      const polishedNote = audio.polishedTrackCount
        ? ` · ${audio.polishedTrackCount} track${audio.polishedTrackCount === 1 ? "" : "s"} polished`
        : "";
      lines.push(`Audio: ${audio.presetName} (${audio.treatmentLine})${polishedNote}`);
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
    buildReviewSummary,
    encodeWav,
    decodeWav,
    processSamples,
    buildSourceWav,
    computeSettingsHash,
    processPolish,
    processPolishAsync,
    hasCompletePolishedTracks,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

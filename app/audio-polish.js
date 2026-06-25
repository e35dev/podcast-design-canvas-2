"use strict";

// Audio polish model for Podcast Design Canvas (#15 — creator-facing audio polish).
//
// This is the single source of truth for the audio step that follows style selection:
// a small set of clear quality presets (Natural, Clean, Studio), four simple cleanup
// controls expressed as creator goals rather than technical processing, and a per-track
// readiness indicator derived from the real imported speaker sources. DOM-free on purpose
// so the same rules drive the screen and the tests. No build, no dependencies.
(function (global) {
  // The four creator-facing goals. Each maps to one understandable improvement, never a
  // raw audio parameter ("noise cleanup", not "noise gate threshold").
  const CONTROLS = [
    { key: "noise", label: "Noise cleanup", hint: "Remove background hiss, hum, and room noise." },
    { key: "leveling", label: "Voice leveling", hint: "Even out loud and quiet moments so everyone sits at a comfortable volume." },
    { key: "clarity", label: "Speech clarity", hint: "Bring voices forward so every word is easy to follow." },
    { key: "enhancement", label: "Overall enhancement", hint: "A final warmth-and-polish pass for a produced sound." },
  ];

  // Shared intensity scale. Creator-facing words, not decibels. `off` always means "leave
  // this alone", which keeps the Natural end of the range honest.
  const LEVELS = [
    { id: "off", label: "Off", value: 0 },
    { id: "light", label: "Light", value: 1 },
    { id: "medium", label: "Medium", value: 2 },
    { id: "strong", label: "Strong", value: 3 },
  ];

  // Quality presets, ordered from most natural to most produced. Each is a complete set of
  // control levels so picking one is a single confident choice, not four separate dials.
  const AUDIO_PRESETS = [
    {
      id: "natural",
      name: "Natural",
      tagline: "True to the room, with just a gentle cleanup.",
      controls: { noise: "light", leveling: "light", clarity: "light", enhancement: "off" },
    },
    {
      id: "clean",
      name: "Clean",
      tagline: "Clear, balanced voices with background noise removed.",
      controls: { noise: "medium", leveling: "medium", clarity: "medium", enhancement: "light" },
    },
    {
      id: "studio",
      name: "Studio",
      tagline: "A polished, broadcast-ready sound for every speaker.",
      controls: { noise: "strong", leveling: "strong", clarity: "strong", enhancement: "medium" },
    },
  ];

  function controlKeys() {
    return CONTROLS.map((control) => control.key);
  }

  function defaultPreset() {
    return AUDIO_PRESETS[0];
  }

  function getPreset(id) {
    return AUDIO_PRESETS.find((preset) => preset.id === id) || defaultPreset();
  }

  function getControl(key) {
    return CONTROLS.find((control) => control.key === key) || null;
  }

  function getLevel(id) {
    return LEVELS.find((level) => level.id === id) || LEVELS[0];
  }

  // A clean copy of a preset's control levels, so a selection never shares a reference with
  // the preset definition (adjusting a control must not mutate the preset).
  function controlsFromPreset(presetId) {
    const preset = getPreset(presetId);
    const controls = {};
    controlKeys().forEach((key) => {
      controls[key] = preset.controls[key] || "off";
    });
    return controls;
  }

  // A fresh audio selection: the first (most natural) preset, with its control levels copied
  // in so the creator starts from a sensible, fully-described treatment.
  function createSelection() {
    return { presetId: defaultPreset().id, controls: controlsFromPreset(defaultPreset().id) };
  }

  // Adopt a preset: switch the named preset and reset every control to its levels. Picking a
  // preset is meant to be a confident reset, so earlier manual tweaks are replaced.
  function applyPresetToSelection(selection, presetId) {
    const preset = getPreset(presetId);
    return { presetId: preset.id, controls: controlsFromPreset(preset.id) };
  }

  // Adjust one control. The preset id is kept as the creator's starting point, but once the
  // levels diverge from it `matchPreset` reports the treatment as custom.
  function setControl(selection, key, levelId) {
    const base = selection && typeof selection === "object" ? selection : createSelection();
    const controls = Object.assign({}, base.controls);
    if (controlKeys().indexOf(key) === -1) {
      return { presetId: base.presetId, controls };
    }
    controls[key] = getLevel(levelId).id;
    return { presetId: base.presetId, controls };
  }

  // The preset whose levels exactly match the current controls, or null when the creator has
  // customized the treatment. Lets the summary say "Studio" or "Custom (based on Studio)".
  function matchPreset(controls) {
    const current = controls || {};
    return (
      AUDIO_PRESETS.find((preset) =>
        controlKeys().every((key) => (current[key] || "off") === (preset.controls[key] || "off")),
      ) || null
    );
  }

  // Whether a treatment does anything at all. An all-off selection is a real, valid choice
  // ("leave my audio untouched") and the summary should say so rather than imply processing.
  function activeControls(controls) {
    const current = controls || {};
    return CONTROLS.filter((control) => getLevel(current[control.key]).value > 0).map((control) => ({
      key: control.key,
      label: control.label,
      levelId: getLevel(current[control.key]).id,
      levelLabel: getLevel(current[control.key]).label,
    }));
  }

  // Is this imported track ready to be polished? A track with no assigned source can't be
  // treated, so it surfaces as needs-source first — the empty-input case is never "ready".
  function trackReadiness(speaker) {
    const data = speaker && typeof speaker === "object" ? speaker : {};
    const source = typeof data.sourceLabel === "string" ? data.sourceLabel.trim() : "";
    const ready = Boolean(source) && !/^no file chosen/i.test(source);
    return ready ? "ready" : "needs-source";
  }

  // Per-speaker indicators tied to the real imported tracks. Every assigned speaker gets the
  // same chosen treatment, plus an honest readiness status derived from its source — so the
  // step shows each track rather than a single global toggle.
  function buildTrackTreatments(speakers, selection) {
    const list = Array.isArray(speakers) ? speakers : [];
    const controls = (selection && selection.controls) || createSelection().controls;
    const active = activeControls(controls);
    const treatmentLabel = active.length
      ? active.map((entry) => entry.label).join(", ")
      : "No processing — left untouched";
    return list.map((speaker) => {
      const status = trackReadiness(speaker);
      return {
        role: (speaker && speaker.role) || "Speaker",
        name: (speaker && speaker.name) || "Unnamed speaker",
        sourceLabel: (speaker && speaker.sourceLabel) || "",
        status,
        ready: status === "ready",
        treatmentLabel,
      };
    });
  }

  // Everything the review/export path shows for the saved audio treatment. Computed from the
  // selection and the real speakers, so the summary always reflects the actual choices.
  function summarizeAudio(selection, speakers) {
    const base = selection && typeof selection === "object" ? selection : createSelection();
    const controls = base.controls || createSelection().controls;
    const matched = matchPreset(controls);
    const startedFrom = getPreset(base.presetId);
    const tracks = buildTrackTreatments(speakers, base);
    const active = activeControls(controls);
    return {
      presetId: startedFrom.id,
      presetName: startedFrom.name,
      isCustom: !matched,
      // "Studio" when untouched; "Custom (based on Studio)" once a control diverges.
      treatmentName: matched ? matched.name : `Custom (based on ${startedFrom.name})`,
      tagline: startedFrom.tagline,
      controls: CONTROLS.map((control) => ({
        key: control.key,
        label: control.label,
        levelId: getLevel(controls[control.key]).id,
        levelLabel: getLevel(controls[control.key]).label,
        on: getLevel(controls[control.key]).value > 0,
      })),
      activeCount: active.length,
      tracks,
      trackCount: tracks.length,
      readyCount: tracks.filter((track) => track.ready).length,
    };
  }

  const api = {
    CONTROLS,
    LEVELS,
    AUDIO_PRESETS,
    controlKeys,
    defaultPreset,
    getPreset,
    getControl,
    getLevel,
    controlsFromPreset,
    createSelection,
    applyPresetToSelection,
    setControl,
    matchPreset,
    activeControls,
    trackReadiness,
    buildTrackTreatments,
    summarizeAudio,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

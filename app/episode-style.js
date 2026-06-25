"use strict";

// Preset visual styles + preview model for Podcast Design Canvas (#4).
//
// This is the single source of truth for the preset-first look step that follows episode
// setup: a small set of clearly different show styles, adjustable layout and pacing, and
// a preview built from the creator's actual assigned Host/Guest speaker buckets. DOM-free
// on purpose, so the same rules drive the screen and the tests. No build, no dependencies.
(function (global) {
  // Distinct show identities. Each preset deliberately differs in arrangement, palette,
  // and caption treatment so shows feel different rather than sharing one house look.
  const STYLE_PRESETS = [
    {
      id: "studio-spotlight",
      name: "Studio Spotlight",
      tagline: "Active speaker front and center, the rest in a filmstrip.",
      defaultLayout: "spotlight",
      background: "#10131f",
      surface: "#1b2133",
      accent: "#ffb347",
      textColor: "#f6f7fb",
      captionStyle: "Bold lower-third",
    },
    {
      id: "split-stage",
      name: "Split Stage",
      tagline: "Equal side-by-side frames for an even conversation.",
      defaultLayout: "split",
      background: "#f4f1ea",
      surface: "#ffffff",
      accent: "#e0563b",
      textColor: "#23201c",
      captionStyle: "Clean caption bar",
    },
    {
      id: "panel-grid",
      name: "Panel Grid",
      tagline: "A balanced grid that keeps every guest on screen.",
      defaultLayout: "grid",
      background: "#0f1a2b",
      surface: "#16263d",
      accent: "#4dd0e1",
      textColor: "#eaf6fb",
      captionStyle: "Minimal name tag",
    },
    {
      id: "bold-broadcast",
      name: "Bold Broadcast",
      tagline: "High-contrast frames with big animated captions.",
      defaultLayout: "spotlight",
      background: "#1a0f2b",
      surface: "#2a1745",
      accent: "#ff5d8f",
      textColor: "#f7eefc",
      captionStyle: "Big animated captions",
    },
  ];

  const LAYOUTS = [
    { id: "auto", label: "Auto (match speakers)" },
    { id: "spotlight", label: "Spotlight" },
    { id: "split", label: "Side by side" },
    { id: "grid", label: "Grid" },
  ];

  const PACING = [
    { id: "relaxed", label: "Relaxed", note: "Longer holds and fewer cuts — calm and conversational." },
    { id: "balanced", label: "Balanced", note: "A natural rhythm that cuts on speaker changes." },
    { id: "punchy", label: "Punchy", note: "Tighter cuts and quicker reframes for more energy." },
  ];

  // Sample three-speaker content used to show how a finished multi-speaker episode looks
  // before the creator has imported their own recording.
  const SAMPLE_SPEAKERS = [
    { role: "Host", name: "Sam Rivera" },
    { role: "Guest 1", name: "Dana Kim" },
    { role: "Guest 2", name: "Alex Chen" },
  ];

  // Per-preset, demo-quality preview content: a real episode title, a burned-in caption,
  // an on-brand overlay, and the on-screen text treatments that make each look distinct.
  const PRESET_PREVIEW_DETAILS = {
    "studio-spotlight": {
      episodeTitle: "Building In Public",
      kicker: "Episode 42",
      captionText: "...and that's how we shipped it in a weekend.",
      overlayLabel: "● LIVE",
      titleTreatment: "lower-third",
      captionTreatment: "bold-lower-third",
    },
    "split-stage": {
      episodeTitle: "Founders Unfiltered",
      kicker: "The honest take",
      captionText: "Two founders, one honest conversation.",
      overlayLabel: "S2 · E07",
      titleTreatment: "topic-card",
      captionTreatment: "clean-bar",
    },
    "panel-grid": {
      episodeTitle: "The Weekly Panel",
      kicker: "Roundtable",
      captionText: "The whole panel weighs in on this week's news.",
      overlayLabel: "PANEL",
      titleTreatment: "minimal-tag",
      captionTreatment: "name-tag",
    },
    "bold-broadcast": {
      episodeTitle: "Bold Takes",
      kicker: "Hot off the mic",
      captionText: "BIG IDEA — ship faster, learn louder.",
      overlayLabel: "BREAKING",
      titleTreatment: "broadcast",
      captionTreatment: "big-animated",
    },
  };

  function defaultPreset() {
    return STYLE_PRESETS[0];
  }

  function getPreset(id) {
    return STYLE_PRESETS.find((preset) => preset.id === id) || defaultPreset();
  }

  function getLayout(id) {
    return LAYOUTS.find((layout) => layout.id === id) || LAYOUTS[0];
  }

  function getPacing(id) {
    return PACING.find((pacing) => pacing.id === id) || PACING[1];
  }

  function createSelection() {
    return { presetId: STYLE_PRESETS[0].id, layout: "auto", pacing: "balanced" };
  }

  // When a creator picks a preset, adopt its recommended layout unless they already
  // chose a specific arrangement. Keeps each preset feeling distinct in the preview.
  function applyPresetToSelection(selection, presetId, keepLayout) {
    const next = Object.assign({}, selection || createSelection());
    const preset = getPreset(presetId);
    next.presetId = preset.id;
    if (!keepLayout) {
      next.layout = preset.defaultLayout;
    }
    return next;
  }

  // Resolve "auto" into a concrete arrangement from the speaker count: one → spotlight,
  // two → side by side, three or more → grid. This is the preset-first promise — a good
  // default appears without the creator touching a blank canvas.
  function resolveLayout(selection, speakerCount) {
    const chosen = selection && selection.layout;
    if (chosen && chosen !== "auto") {
      return chosen;
    }
    const count = typeof speakerCount === "number" ? speakerCount : 0;
    if (count <= 1) {
      return "spotlight";
    }
    if (count === 2) {
      return "split";
    }
    return "grid";
  }

  // Build preview frames from the real assigned speaker buckets. In spotlight layouts the
  // Host (or the first speaker, if none is a Host) is flagged active so it can be featured.
  // Frames are derived from the setup — never invented — so the preview is honest.
  function buildPreviewFrames(speakers, selection, speakerCount) {
    const list = Array.isArray(speakers) ? speakers : [];
    const count = typeof speakerCount === "number" ? speakerCount : list.length;
    const layout = resolveLayout(selection, count);
    let activeIndex = list.findIndex((speaker) => /host/i.test((speaker && speaker.role) || ""));
    if (activeIndex < 0 && list.length) {
      activeIndex = 0;
    }
    return list.map((speaker, index) => ({
      role: (speaker && speaker.role) || "Speaker",
      name: (speaker && speaker.name) || "Unnamed speaker",
      active: layout === "spotlight" && index === activeIndex,
      layout,
    }));
  }

  // Everything the workspace shows once a style is applied. Computed from the selection
  // and speaker count, so the applied-style summary always reflects the real choices.
  function summarizeStyle(selection, speakerCount) {
    const preset = getPreset(selection && selection.presetId);
    const layoutId = resolveLayout(selection, speakerCount);
    const usedAuto = !selection || !selection.layout || selection.layout === "auto";
    return {
      presetId: preset.id,
      presetName: preset.name,
      tagline: preset.tagline,
      layoutId,
      layoutLabel: getLayout(layoutId).label,
      resolvedFromAuto: usedAuto,
      pacingId: getPacing(selection && selection.pacing).id,
      pacingLabel: getPacing(selection && selection.pacing).label,
      captionStyle: preset.captionStyle,
      accent: preset.accent,
      background: preset.background,
    };
  }

  function trimText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  // A stable hue (0-359) derived from a name, so each speaker tile reads as a different
  // "camera" without random flicker between renders.
  function hueFromName(name) {
    const text = trimText(name) || "Speaker";
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) % 360;
    }
    return hash;
  }

  function speakerInitials(name) {
    const parts = trimText(name).split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return "SP";
    }
    return parts.map((part) => part.charAt(0)).join("").slice(0, 2).toUpperCase();
  }

  function previewDetailsForPreset(preset) {
    const item = preset && preset.id ? preset : defaultPreset();
    return PRESET_PREVIEW_DETAILS[item.id] || {
      episodeTitle: "Episode preview",
      kicker: "Preview",
      captionText: "This is how your on-screen captions will look.",
      overlayLabel: "",
      titleTreatment: "lower-third",
      captionTreatment: "clean-bar",
    };
  }

  // Everything a realistic, publishable-looking episode preview needs: themed speaker
  // "video" tiles (a distinct duotone per speaker), an episode title treatment, a burned-in
  // caption, an on-brand overlay, and pacing/format cues. DOM-free so the UI and tests share
  // exactly the same model.
  function buildRichPreviewModel(preset, selection, options) {
    const opts = options || {};
    const item = preset && preset.id ? preset : defaultPreset();
    const speakers = Array.isArray(opts.speakers) && opts.speakers.length
      ? opts.speakers
      : SAMPLE_SPEAKERS;
    const sel = selection || {
      presetId: item.id,
      layout: item.defaultLayout,
      pacing: "balanced",
    };
    const details = previewDetailsForPreset(item);
    const showName = trimText(opts.showName);
    const layoutId = resolveLayout(sel, speakers.length);
    const pacing = getPacing(sel.pacing);
    const baseFrames = buildPreviewFrames(speakers, Object.assign({}, sel, { layout: layoutId }), speakers.length);
    const frames = baseFrames.map((frame) => {
      const hue = hueFromName(frame.name);
      return Object.assign({}, frame, {
        initials: speakerInitials(frame.name),
        // A duotone "on-camera" gradient that differs per speaker but stays on-theme.
        tint: `linear-gradient(150deg, hsl(${hue}, 52%, 42%), hsl(${(hue + 38) % 360}, 46%, 24%))`,
      });
    });
    // Pacing maps to how many cut markers the timeline shows.
    const cutCount = pacing.id === "punchy" ? 7 : pacing.id === "relaxed" ? 3 : 5;
    return {
      presetId: item.id,
      presetName: item.name,
      tagline: item.tagline,
      showName: showName,
      kicker: details.kicker,
      titleText: showName || details.episodeTitle,
      episodeTitle: details.episodeTitle,
      captionText: details.captionText,
      overlayLabel: details.overlayLabel,
      titleTreatment: details.titleTreatment,
      captionTreatment: details.captionTreatment,
      frames: frames,
      layoutId: layoutId,
      layoutLabel: getLayout(layoutId).label,
      pacingId: pacing.id,
      pacingLabel: pacing.label,
      cutCount: cutCount,
      captionStyle: item.captionStyle,
      theme: {
        background: item.background,
        surface: item.surface,
        accent: item.accent,
        textColor: item.textColor,
      },
    };
  }

  const api = {
    STYLE_PRESETS,
    LAYOUTS,
    PACING,
    SAMPLE_SPEAKERS,
    defaultPreset,
    getPreset,
    getLayout,
    getPacing,
    createSelection,
    applyPresetToSelection,
    resolveLayout,
    buildPreviewFrames,
    summarizeStyle,
    speakerInitials,
    previewDetailsForPreset,
    buildRichPreviewModel,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcEpisodeStyle = api;
}(typeof window !== "undefined" ? window : globalThis));

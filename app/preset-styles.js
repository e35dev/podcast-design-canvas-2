"use strict";

// Preset visual style model for Podcast Design Canvas (#4 — style selection + preview).
//
// DOM-free rules for choosing a podcast look, tuning layout and pacing, and building a
// speaker-aware preview from the episode setup summary. Same module runs in the browser
// (global PdcPresetStyles) and in node (tests require it).
(function (global) {
  const PRESETS = [
    {
      key: "studio-spotlight",
      label: "Studio Spotlight",
      description: "Host front and center with guests in supporting frames — classic interview energy.",
      accent: "#6c4cff",
      surface: "#1a1630",
      frameStyle: "rounded",
    },
    {
      key: "conversation-split",
      label: "Conversation Split",
      description: "Clean side-by-side frames that keep every speaker equally visible.",
      accent: "#ff7a59",
      surface: "#1c1f2e",
      frameStyle: "sharp",
    },
    {
      key: "gallery-grid",
      label: "Gallery Grid",
      description: "A balanced tile layout that scales from duo chats to full panels.",
      accent: "#1f9d6b",
      surface: "#121820",
      frameStyle: "soft",
    },
  ];

  const LAYOUT_OPTIONS = [
    { key: "balanced", label: "Balanced", hint: "Equal visual weight across speakers." },
    { key: "host-emphasis", label: "Host emphasis", hint: "Give the host a larger, leading frame." },
    { key: "wide", label: "Wide cinematic", hint: "Letterbox framing with breathing room." },
  ];

  const PACING_OPTIONS = [
    { key: "relaxed", label: "Relaxed", hint: "Longer holds — calm, interview pacing." },
    { key: "conversational", label: "Conversational", hint: "Natural cuts that follow the dialogue." },
    { key: "energetic", label: "Energetic", hint: "Quicker rhythm for high-energy shows." },
  ];

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function findPreset(key) {
    return PRESETS.find((p) => p.key === key) || null;
  }

  function normalizeLayout(value) {
    return LAYOUT_OPTIONS.some((o) => o.key === value) ? value : "balanced";
  }

  function normalizePacing(value) {
    return PACING_OPTIONS.some((o) => o.key === value) ? value : "conversational";
  }

  function createDraft() {
    return {
      presetKey: "",
      layout: "balanced",
      pacing: "conversational",
    };
  }

  function validateDraft(draft) {
    const data = draft && typeof draft === "object" ? draft : {};
    const errors = {};
    const messages = [];

    if (!findPreset(trim(data.presetKey))) {
      errors.presetKey = "Choose a visual style preset to preview how your episode will look.";
      messages.push(errors.presetKey);
    }

    return { ok: messages.length === 0, errors, messages };
  }

  function speakerSlots(speakers) {
    const list = Array.isArray(speakers) ? speakers : [];
    return list.map((raw) => {
      const sp = raw && typeof raw === "object" ? raw : {};
      return {
        role: trim(sp.role) || "Speaker",
        name: trim(sp.name) || "Unnamed speaker",
        initials: initialsFor(trim(sp.name)),
      };
    });
  }

  function initialsFor(name) {
    const text = trim(name);
    if (!text) {
      return "?";
    }
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Compose preview frames from preset + layout + episode speakers. Each frame carries
  // grid placement and emphasis so the UI can render a distinct look per combination.
  function buildPreview(styleDraft, episodeSummary) {
    const summary = episodeSummary && typeof episodeSummary === "object" ? episodeSummary : {};
    const style = styleDraft && typeof styleDraft === "object" ? styleDraft : {};
    const preset = findPreset(trim(style.presetKey));
    const layout = normalizeLayout(style.layout);
    const pacing = normalizePacing(style.pacing);
    const speakers = speakerSlots(summary.speakers);

    if (!preset) {
      return {
        preset: null,
        layout,
        pacing,
        episodeName: trim(summary.episodeName),
        frames: [],
        pacingLabel: pacingLabel(pacing),
        layoutLabel: layoutLabel(layout),
      };
    }

    const frames = placeFrames(preset.key, layout, speakers);

    return {
      preset: {
        key: preset.key,
        label: preset.label,
        description: preset.description,
        accent: preset.accent,
        surface: preset.surface,
        frameStyle: preset.frameStyle,
      },
      layout,
      pacing,
      layoutLabel: layoutLabel(layout),
      pacingLabel: pacingLabel(pacing),
      episodeName: trim(summary.episodeName),
      frames,
    };
  }

  function layoutLabel(key) {
    const found = LAYOUT_OPTIONS.find((o) => o.key === key);
    return found ? found.label : LAYOUT_OPTIONS[0].label;
  }

  function pacingLabel(key) {
    const found = PACING_OPTIONS.find((o) => o.key === key);
    return found ? found.label : PACING_OPTIONS[1].label;
  }

  function placeFrames(presetKey, layout, speakers) {
    if (!speakers.length) {
      return [];
    }

    if (presetKey === "studio-spotlight") {
      return spotlightFrames(speakers, layout);
    }
    if (presetKey === "conversation-split") {
      return splitFrames(speakers, layout);
    }
    return gridFrames(speakers, layout);
  }

  function hostIndex(speakers) {
    const idx = speakers.findIndex((s) => /^host$/i.test(s.role));
    return idx >= 0 ? idx : 0;
  }

  function spotlightFrames(speakers, layout) {
    const host = hostIndex(speakers);
    const ordered = [speakers[host], ...speakers.filter((_, i) => i !== host)];
    const hostEmphasis = layout === "host-emphasis";
    const wide = layout === "wide";

    return ordered.map((sp, index) => {
      const isHost = index === 0;
      let col = 2;
      let row = 1;
      let colSpan = 1;
      let rowSpan = 1;
      let emphasis = isHost ? "lead" : "support";

      if (isHost) {
        colSpan = wide ? 4 : 2;
        rowSpan = hostEmphasis ? 2 : 1;
        col = wide ? 1 : 2;
      } else if (index === 1) {
        col = 1;
        row = hostEmphasis ? 3 : 2;
      } else if (index === 2) {
        col = wide ? 1 : 3;
        row = hostEmphasis ? 3 : 2;
      } else {
        col = ((index - 1) % 3) + 1;
        row = hostEmphasis ? 3 + Math.floor((index - 1) / 3) : 2 + Math.floor((index - 1) / 3);
      }

      return frameFor(sp, { col, row, colSpan, rowSpan, emphasis });
    });
  }

  function splitFrames(speakers, layout) {
    const wide = layout === "wide";
    const hostEmphasis = layout === "host-emphasis";
    const count = speakers.length;

    return speakers.map((sp, index) => {
      let col = index + 1;
      let colSpan = 1;
      let row = 1;
      let rowSpan = wide ? 2 : 1;
      let emphasis = "equal";

      if (hostEmphasis && index === hostIndex(speakers)) {
        colSpan = Math.min(2, count);
        emphasis = "lead";
      } else if (hostEmphasis && index > hostIndex(speakers)) {
        col = index;
      }

      if (count === 1) {
        colSpan = wide ? 4 : 3;
        col = wide ? 1 : 2;
      }

      return frameFor(sp, { col, row, colSpan, rowSpan, emphasis });
    });
  }

  function gridFrames(speakers, layout) {
    const wide = layout === "wide";
    const hostEmphasis = layout === "host-emphasis";
    const host = hostIndex(speakers);

    return speakers.map((sp, index) => {
      const cols = wide ? 4 : 3;
      const col = (index % cols) + 1;
      const row = Math.floor(index / cols) + 1;
      let colSpan = 1;
      let rowSpan = 1;
      let emphasis = "equal";

      if (hostEmphasis && index === host) {
        colSpan = wide ? 2 : 2;
        rowSpan = 1;
        emphasis = "lead";
      }

      return frameFor(sp, { col, row, colSpan, rowSpan, emphasis });
    });
  }

  function frameFor(speaker, placement) {
    return {
      role: speaker.role,
      name: speaker.name,
      initials: speaker.initials,
      col: placement.col,
      row: placement.row,
      colSpan: placement.colSpan || 1,
      rowSpan: placement.rowSpan || 1,
      emphasis: placement.emphasis || "equal",
    };
  }

  function summarize(styleDraft, episodeSummary) {
    const preview = buildPreview(styleDraft, episodeSummary);
    const preset = preview.preset;

    return {
      applied: Boolean(preset),
      presetKey: preset ? preset.key : "",
      presetLabel: preset ? preset.label : "",
      presetDescription: preset ? preset.description : "",
      layout: preview.layout,
      layoutLabel: preview.layoutLabel,
      pacing: preview.pacing,
      pacingLabel: preview.pacingLabel,
      accent: preset ? preset.accent : "",
      frameStyle: preset ? preset.frameStyle : "",
      speakerCount: preview.frames.length,
      frames: preview.frames,
      episodeName: preview.episodeName,
    };
  }

  const api = {
    PRESETS,
    LAYOUT_OPTIONS,
    PACING_OPTIONS,
    createDraft,
    validateDraft,
    buildPreview,
    summarize,
    findPreset,
    normalizeLayout,
    normalizePacing,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcPresetStyles = api;
}(typeof window !== "undefined" ? window : globalThis));

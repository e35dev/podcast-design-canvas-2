"use strict";

// Rich episode look previews for Podcast Design Canvas (#102).
//
// Builds demo-quality preset previews with realistic multi-speaker framing, captions,
// title treatment, overlays, and pacing cues. DOM-free so UI and tests share one model.
(function (global) {
  function styleApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./episode-style.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcEpisodeStyle;
  }

  const SAMPLE_SPEAKERS = [
    { role: "Host", name: "Sam Rivera", initials: "SR", tile: "#5b4bff" },
    { role: "Guest 1", name: "Dana Kim", initials: "DK", tile: "#2bb9a9" },
    { role: "Guest 2", name: "Alex Chen", initials: "AC", tile: "#f0a030" },
  ];

  const PRESET_OVERLAY = {
    "studio-spotlight": "LIVE",
    "split-stage": "Founders",
    "panel-grid": "Panel",
    "bold-broadcast": "ON AIR",
  };

  const PRESET_VISUAL_PROFILE = {
    "studio-spotlight": {
      pacing: "balanced",
      captionVariant: "lower-third",
      titleVariant: "episode-bar",
      captionText: "The host leads in the hero frame while guests stay in the filmstrip.",
      frameMode: "spotlight",
    },
    "split-stage": {
      pacing: "relaxed",
      captionVariant: "clean-bar",
      titleVariant: "show-serif",
      captionText: "Equal side-by-side frames with a calm, full-width caption bar.",
      frameMode: "duo",
    },
    "panel-grid": {
      pacing: "balanced",
      captionVariant: "minimal-tag",
      titleVariant: "compact",
      captionText: "Every guest stays on screen in a balanced panel row.",
      frameMode: "panel-row",
    },
    "bold-broadcast": {
      pacing: "punchy",
      captionVariant: "broadcast",
      titleVariant: "broadcast-ticker",
      captionText: "HIGH-ENERGY CUTS WITH BIG ON-AIR CAPTIONS.",
      frameMode: "broadcast-spotlight",
    },
  };

  function getVisualProfile(presetId) {
    return PRESET_VISUAL_PROFILE[presetId] || PRESET_VISUAL_PROFILE["studio-spotlight"];
  }

  function buildFramesForMode(summary, layoutId, frameMode) {
    const speakers = summary.speakers.slice();
    let activeIndex = speakers.findIndex((speaker) => /host/i.test(speaker.role));
    if (activeIndex < 0) {
      activeIndex = 0;
    }

    let visible = speakers;
    if (frameMode === "duo") {
      visible = speakers.slice(0, 2);
    }

    return visible.map((speaker, index) => ({
      role: speaker.role,
      name: speaker.name,
      initials: speaker.initials,
      tile: speaker.tile,
      active: layoutId === "spotlight" || frameMode === "broadcast-spotlight"
        ? index === activeIndex
        : true,
    }));
  }

  function lookFromPreset(preset, summary, selection, frameMode) {
    const STY = styleApi();
    const profile = getVisualProfile(preset.id);
    const mergedSelection = Object.assign({}, selection || {}, {
      presetId: preset.id,
      layout: (selection && selection.layout) || preset.defaultLayout,
      pacing: (selection && selection.pacing) || profile.pacing,
    });
    const layoutId = STY.resolveLayout(mergedSelection, summary.speakerCount);
    const pacing = STY.getPacing(mergedSelection.pacing);
    const frames = buildFramesForMode(summary, layoutId, frameMode || profile.frameMode);
    return {
      presetId: preset.id,
      presetName: preset.name,
      tagline: preset.tagline,
      layoutId: layoutId,
      layoutLabel: STY.getLayout(layoutId).label,
      pacingId: pacing.id,
      pacingLabel: pacing.label,
      captionStyle: preset.captionStyle,
      captionVariant: profile.captionVariant,
      titleVariant: profile.titleVariant,
      frameMode: frameMode || profile.frameMode,
      formatCue: STY.presetCardSummary(preset).formatCue,
      episodeTitle: summary.episodeName,
      showName: summary.showName,
      captionText: profile.captionText,
      overlayLabel: PRESET_OVERLAY[preset.id] || preset.name.split(" ")[0].toUpperCase(),
      theme: {
        background: preset.background,
        surface: preset.surface,
        accent: preset.accent,
        textColor: preset.textColor,
      },
      frames: frames,
    };
  }

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function sampleEpisodeSummary(showName) {
    const title = trim(showName) || "Founders Unfiltered";
    return {
      episodeName: `${title} · Episode 12`,
      showName: title,
      speakers: SAMPLE_SPEAKERS.map((speaker) => Object.assign({}, speaker)),
      speakerCount: SAMPLE_SPEAKERS.length,
    };
  }

  function initialsForName(name) {
    const parts = trim(name).split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return "?";
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function buildEpisodeLook(presetId, options) {
    const STY = styleApi();
    const opts = options || {};
    const preset = STY ? STY.getPreset(presetId) : null;
    if (!preset) {
      return null;
    }
    const summary = sampleEpisodeSummary(opts.showName);
    const selection = {
      presetId: preset.id,
      layout: preset.defaultLayout,
      pacing: opts.pacing || getVisualProfile(preset.id).pacing,
    };
    return lookFromPreset(preset, summary, selection, getVisualProfile(preset.id).frameMode);
  }

  function buildEpisodeLookFromEpisode(presetId, episodeSummary, selection) {
    const STY = styleApi();
    const episode = episodeSummary || {};
    const sel = selection || {};
    const preset = STY ? STY.getPreset(presetId || sel.presetId) : null;
    if (!preset) {
      return null;
    }
    const speakers = Array.isArray(episode.speakers) && episode.speakers.length
      ? episode.speakers.map((speaker, index) => {
        const sample = SAMPLE_SPEAKERS[index] || SAMPLE_SPEAKERS[0];
        const name = trim(speaker && speaker.name) || sample.name;
        return {
          role: (speaker && speaker.role) || sample.role,
          name: name,
          initials: initialsForName(name),
          tile: sample.tile,
        };
      })
      : SAMPLE_SPEAKERS;
    const speakerCount = episode.speakerCount || speakers.length;
    const showName = trim(episode.episodeName).split("·")[0].trim() || "Your show";
    const previewSummary = {
      episodeName: trim(episode.episodeName) || `${showName} · Episode 1`,
      showName: showName,
      speakers: speakers,
      speakerCount: speakerCount,
    };
    const mergedSelection = {
      presetId: preset.id,
      layout: sel.layout || preset.defaultLayout,
      pacing: sel.pacing || getVisualProfile(preset.id).pacing,
    };
    return lookFromPreset(preset, previewSummary, mergedSelection, getVisualProfile(preset.id).frameMode);
  }

  const api = {
    SAMPLE_SPEAKERS,
    PRESET_OVERLAY,
    PRESET_VISUAL_PROFILE,
    sampleEpisodeSummary,
    getVisualProfile,
    buildEpisodeLook,
    buildEpisodeLookFromEpisode,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcStylePreview = api;
}(typeof window !== "undefined" ? window : globalThis));

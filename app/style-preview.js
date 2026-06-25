"use strict";

// Rich episode look previews for Podcast Design Canvas (#102, #120).
//
// Builds demo-quality preset previews with realistic multi-speaker framing, captions,
// title treatment, overlays, and pacing cues. Each preset uses a distinct visual profile
// so creators can tell styles apart at a glance. DOM-free so UI and tests share one model.
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
      previewLayout: "spotlight",
      pacing: "relaxed",
      captionTreatment: "lower-third",
      captionText: "The host holds the room while guests react in the filmstrip.",
      overlayTone: "live",
      titleStyle: "studio-bar",
      frameTiles: ["#ffb347", "#3d4460", "#3d4460"],
    },
    "split-stage": {
      previewLayout: "split",
      pacing: "balanced",
      captionTreatment: "caption-bar",
      captionText: "Two voices stay equal — the conversation stays side by side.",
      overlayTone: "founders",
      titleStyle: "editorial",
      frameTiles: ["#e0563b", "#c9c2b8", "#e0563b"],
    },
    "panel-grid": {
      previewLayout: "grid",
      pacing: "balanced",
      captionTreatment: "minimal-tag",
      captionText: "Every panelist stays on screen with clean name tags.",
      overlayTone: "panel",
      titleStyle: "panel-header",
      frameTiles: ["#4dd0e1", "#243652", "#4dd0e1"],
    },
    "bold-broadcast": {
      previewLayout: "broadcast",
      pacing: "punchy",
      captionTreatment: "broadcast-banner",
      captionText: "ON AIR energy — captions land big on every beat.",
      overlayTone: "on-air",
      titleStyle: "broadcast-ticker",
      frameTiles: ["#ff5d8f", "#7c3aed", "#f0a030"],
    },
  };

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function getVisualProfile(presetId) {
    return PRESET_VISUAL_PROFILE[presetId] || PRESET_VISUAL_PROFILE["studio-spotlight"];
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

  function buildFrames(speakers, layoutId, profile) {
    let activeIndex = speakers.findIndex((speaker) => /host/i.test((speaker && speaker.role) || ""));
    if (activeIndex < 0 && speakers.length) {
      activeIndex = 0;
    }
    const tiles = profile && profile.frameTiles ? profile.frameTiles : [];
    return speakers.map((speaker, index) => {
      const sample = SAMPLE_SPEAKERS[index] || SAMPLE_SPEAKERS[0];
      const name = trim(speaker && speaker.name) || sample.name;
      const isSpotlight = layoutId === "spotlight";
      const isBroadcast = layoutId === "broadcast";
      return {
        role: (speaker && speaker.role) || sample.role,
        name: name,
        initials: speaker && speaker.initials ? speaker.initials : initialsForName(name),
        tile: tiles[index] || sample.tile,
        active: isSpotlight || isBroadcast ? index === activeIndex : true,
      };
    });
  }

  function previewVisualSignature(look) {
    if (!look) {
      return "";
    }
    return [
      look.presetId,
      look.layoutId,
      look.captionTreatment,
      look.overlayTone,
      look.titleStyle,
      look.theme && look.theme.background,
      look.pacingId,
    ].join("|");
  }

  function assembleLook(preset, summary, selection, profile, options) {
    const STY = styleApi();
    const opts = options || {};
    const episode = summary || sampleEpisodeSummary();
    const sel = selection || {};
    const mergedSelection = {
      presetId: preset.id,
      layout: sel.layout || profile.previewLayout || preset.defaultLayout,
      pacing: sel.pacing || profile.pacing || "balanced",
    };
    const speakers = Array.isArray(episode.speakers) && episode.speakers.length
      ? episode.speakers
      : SAMPLE_SPEAKERS;
    const speakerCount = episode.speakerCount || speakers.length;
    const layoutId = opts.useProfileLayout
      ? (profile.previewLayout || STY.resolveLayout(mergedSelection, speakerCount))
      : STY.resolveLayout(mergedSelection, speakerCount);
    const pacing = STY.getPacing(mergedSelection.pacing);
    const showName = trim(episode.showName) || trim(episode.episodeName).split("·")[0].trim() || "Your show";
    return {
      presetId: preset.id,
      presetName: preset.name,
      tagline: preset.tagline,
      layoutId: layoutId,
      layoutLabel: STY.getLayout(layoutId === "broadcast" ? "spotlight" : layoutId).label,
      pacingId: pacing.id,
      pacingLabel: pacing.label,
      captionStyle: preset.captionStyle,
      captionTreatment: profile.captionTreatment,
      captionText: profile.captionText,
      titleStyle: profile.titleStyle,
      overlayTone: profile.overlayTone,
      formatCue: STY.presetCardSummary(preset).formatCue,
      episodeTitle: trim(episode.episodeName) || `${showName} · Episode 12`,
      showName: showName,
      overlayLabel: PRESET_OVERLAY[preset.id] || preset.name.split(" ")[0].toUpperCase(),
      theme: {
        background: preset.background,
        surface: preset.surface,
        accent: preset.accent,
        textColor: preset.textColor,
      },
      frames: buildFrames(speakers, layoutId, profile),
    };
  }

  function buildEpisodeLook(presetId, options) {
    const STY = styleApi();
    const opts = options || {};
    const preset = STY ? STY.getPreset(presetId) : null;
    if (!preset) {
      return null;
    }
    const profile = getVisualProfile(preset.id);
    const summary = sampleEpisodeSummary(opts.showName);
    const selection = {
      presetId: preset.id,
      layout: profile.previewLayout,
      pacing: opts.pacing || profile.pacing,
    };
    return assembleLook(preset, summary, selection, profile, { useProfileLayout: true });
  }

  function buildEpisodeLookFromEpisode(presetId, summary, selection) {
    const STY = styleApi();
    const sel = selection || {};
    const preset = STY ? STY.getPreset(presetId || sel.presetId) : null;
    if (!preset) {
      return null;
    }
    const profile = getVisualProfile(preset.id);
    return assembleLook(preset, summary, sel, profile, { useProfileLayout: false });
  }

  const api = {
    SAMPLE_SPEAKERS,
    PRESET_OVERLAY,
    PRESET_VISUAL_PROFILE,
    sampleEpisodeSummary,
    getVisualProfile,
    previewVisualSignature,
    buildEpisodeLook,
    buildEpisodeLookFromEpisode,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcStylePreview = api;
}(typeof window !== "undefined" ? window : globalThis));

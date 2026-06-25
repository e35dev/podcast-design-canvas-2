"use strict";

// Rich episode look previews for Podcast Design Canvas (#102, #120, #126).
//
// Builds demo-quality preset previews with realistic multi-speaker framing, captions,
// title treatment, overlays, and pacing cues. Each preset uses a distinct visual profile
// with natural podcast sample copy — not developer placeholders.
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
    "studio-spotlight": "Live",
    "split-stage": "Episode 12",
    "panel-grid": "Roundtable",
    "bold-broadcast": "On air",
  };

  const PRESET_VISUAL_PROFILE = {
    "studio-spotlight": {
      previewLayout: "spotlight",
      pacing: "relaxed",
      captionTreatment: "lower-third",
      topicLabel: "Founder interview",
      captionText: "Sam: What changed the week you finally shipped?",
      lowerThird: "Sam Rivera · Host",
      overlayTone: "live",
      titleStyle: "studio-bar",
      frameTiles: ["#ffb347", "#3d4460", "#3d4460"],
      pacingCaptions: {
        relaxed: "Sam: Take your time — what did launch week feel like?",
        balanced: "Sam: What changed the week you finally shipped?",
        punchy: "Sam: Give us the headline from launch week.",
      },
    },
    "split-stage": {
      previewLayout: "split",
      pacing: "balanced",
      captionTreatment: "caption-bar",
      topicLabel: "Building in public",
      captionText: "Dana: We doubled revenue without adding headcount.",
      lowerThird: "Dana Kim · Guest",
      overlayTone: "founders",
      titleStyle: "editorial",
      frameTiles: ["#e0563b", "#c9c2b8", "#e0563b"],
      pacingCaptions: {
        relaxed: "Dana: We made one hiring decision and kept the team lean.",
        balanced: "Dana: We doubled revenue without adding headcount.",
        punchy: "Dana: Two customers became two hundred in six weeks.",
      },
    },
    "panel-grid": {
      previewLayout: "grid",
      pacing: "balanced",
      captionTreatment: "minimal-tag",
      topicLabel: "Product strategy",
      captionText: "Alex: Each team gets one roadmap bet this quarter.",
      lowerThird: "Panel · 3 speakers",
      overlayTone: "panel",
      titleStyle: "panel-header",
      frameTiles: ["#4dd0e1", "#243652", "#4dd0e1"],
      pacingCaptions: {
        relaxed: "Alex: Let's hear one priority from each founder.",
        balanced: "Alex: Each team gets one roadmap bet this quarter.",
        punchy: "Alex: Quick round — what's your single ship this month?",
      },
    },
    "bold-broadcast": {
      previewLayout: "broadcast",
      pacing: "punchy",
      captionTreatment: "broadcast-banner",
      topicLabel: "Breaking news",
      captionText: "Three founders react live to today's funding headlines.",
      lowerThird: "Live from the studio",
      overlayTone: "on-air",
      titleStyle: "broadcast-ticker",
      frameTiles: ["#ff5d8f", "#7c3aed", "#f0a030"],
      pacingCaptions: {
        relaxed: "After the break — founders on what the news means for hiring.",
        balanced: "Three founders react live to today's funding headlines.",
        punchy: "Breaking now — founders respond in real time.",
      },
    },
  };

  const FORBIDDEN_PREVIEW_PHRASES = [
    "on air energy",
    "every panel",
    "every panelist",
    "filmstrip",
    "land big on every beat",
    "sample caption",
    "this is how on-screen text will look",
    "agency split layout",
  ];

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function getVisualProfile(presetId) {
    return PRESET_VISUAL_PROFILE[presetId] || PRESET_VISUAL_PROFILE["studio-spotlight"];
  }

  function resolvePreviewCopy(profile, pacingId) {
    const pacing = pacingId || profile.pacing || "balanced";
    const pacingCaptions = profile.pacingCaptions || {};
    return {
      topicLabel: profile.topicLabel || "",
      captionText: pacingCaptions[pacing] || profile.captionText || "",
      lowerThird: profile.lowerThird || "",
    };
  }

  function defaultCanvasCaption(presetId) {
    const profile = getVisualProfile(presetId);
    return profile.captionText || "Dana: Thanks for joining us on the show today.";
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
    const copy = resolvePreviewCopy(profile, pacing.id);
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
      captionText: copy.captionText,
      topicLabel: copy.topicLabel,
      lowerThird: copy.lowerThird,
      titleStyle: profile.titleStyle,
      overlayTone: profile.overlayTone,
      formatCue: STY.presetCardSummary(preset).formatCue,
      episodeTitle: trim(episode.episodeName) || `${showName} · Episode 12`,
      showName: showName,
      overlayLabel: PRESET_OVERLAY[preset.id] || preset.name.split(" ")[0],
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
    FORBIDDEN_PREVIEW_PHRASES,
    sampleEpisodeSummary,
    getVisualProfile,
    resolvePreviewCopy,
    defaultCanvasCaption,
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

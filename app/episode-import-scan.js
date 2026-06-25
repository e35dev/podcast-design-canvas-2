"use strict";

// Episode import scan layout for Podcast Design Canvas (#86).
//
// Section order, speaker field grouping, and draft-review summaries so the import
// screen stays easy to scan with multiple speaker sources. DOM-free for tests and UI.
(function (global) {
  const SETUP_SECTIONS = [
    { id: "details", step: 1, title: "Episode details" },
    { id: "source", step: 2, title: "Recording source" },
    { id: "speakers", step: 3, title: "Speakers & sources" },
  ];

  const SPEAKER_GROUPS = {
    identity: { id: "identity", label: "Name & role" },
    recording: { id: "recording", label: "Recording source" },
    social: { id: "social", label: "Social links" },
  };

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function sectionById(id) {
    return SETUP_SECTIONS.find((item) => item.id === id) || null;
  }

  function sectionTitle(id) {
    const section = sectionById(id);
    if (!section) {
      return id;
    }
    return `${section.step}. ${section.title}`;
  }

  function speakerGroupLabel(groupId) {
    const group = SPEAKER_GROUPS[groupId];
    return group ? group.label : groupId;
  }

  function countSocialLinks(speaker) {
    const social = speaker && speaker.social ? speaker.social : {};
    return Object.keys(social).filter((key) => trim(social[key])).length;
  }

  function speakerSourceLabel(speaker, sourceMode) {
    if (!speaker) {
      return "Source pending";
    }
    if (sourceMode === "upload") {
      return trim(speaker.fileName) || "Video file pending";
    }
    return trim(speaker.trackLabel) || "Channel label optional";
  }

  function buildDraftSummary(draft, episodeSummary) {
    const episode = episodeSummary || {};
    const setup = draft || {};
    const speakers = Array.isArray(setup.speakers) ? setup.speakers : [];
    const sourceMode = setup.sourceMode || episode.sourceMode || "upload";

    const speakerLines = speakers.map((speaker, index) => ({
      index: index + 1,
      role: speaker.role || `Guest ${index}`,
      name: trim(speaker.name) || "Name pending",
      source: speakerSourceLabel(speaker, sourceMode),
      socialCount: countSocialLinks(speaker),
    }));

    const namedCount = speakerLines.filter((line) => line.name !== "Name pending").length;
    const socialCount = speakerLines.reduce((total, line) => total + line.socialCount, 0);

    return {
      episodeName: trim(setup.episodeName) || trim(episode.episodeName) || "Untitled episode",
      sourceMode: sourceMode,
      sourceModeLabel: episode.sourceModeLabel || (sourceMode === "riverside" ? "Riverside link" : "Upload synced files"),
      riversideLink: trim(setup.riversideLink),
      speakerCount: speakers.length,
      speakerLines: speakerLines,
      namedSpeakerCount: namedCount,
      socialLinkCount: socialCount,
      reviewLine: `${speakers.length} speaker source${speakers.length === 1 ? "" : "s"} · ${namedCount} named · ${socialCount} social link${socialCount === 1 ? "" : "s"}`,
    };
  }

  const api = {
    SETUP_SECTIONS,
    SPEAKER_GROUPS,
    sectionById,
    sectionTitle,
    speakerGroupLabel,
    buildDraftSummary,
    countSocialLinks,
    speakerSourceLabel,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcEpisodeImportScan = api;
}(typeof window !== "undefined" ? window : globalThis));

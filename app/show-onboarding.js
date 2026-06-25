"use strict";

// Show onboarding order for Podcast Design Canvas (#73).
//
// Episode import must come before brand kit in the primary creator path. DOM-free so
// the UI and tests share one source of truth for first-step routing.
(function (global) {
  const FIRST_STEP = "episode-setup";

  function firstStepAfterCreateShow() {
    return FIRST_STEP;
  }

  function showDetailSections(show) {
    const episodes = show && Array.isArray(show.episodes) ? show.episodes : [];
    const episodeCount = episodes.length;
    const hasBrandKit = Boolean(show && show.brandKit);
    const resumable = episodes.find(function (ep) {
      return ep.status === "draft" || ep.status === "in-progress";
    });

    if (resumable) {
      const resumeLabel = resumable.status === "in-progress" ? "Continue production →" : "Resume draft →";
      return {
        primary: {
          id: FIRST_STEP,
          title: `Continue “${resumable.name}”`,
          hint: resumable.status === "in-progress"
            ? "Pick up where you left off in the guided production workspace — style, audio, moments, and export."
            : "Finish importing your recording, assign speakers, and continue through the guided production flow.",
          actionLabel: resumeLabel,
          resumableEpisodeId: resumable.id,
        },
        secondary: {
          id: "brand-kit",
          title: "Brand kit (optional)",
          hint: hasBrandKit
            ? "Reusable logo, colors, and captions — edit any time after your first import."
            : "Set up later. Episode import and speaker context come first.",
          actionLabel: hasBrandKit ? "Edit brand kit" : "Set up brand kit later",
        },
      };
    }

    return {
      primary: {
        id: FIRST_STEP,
        title: episodeCount ? "Start a new episode" : "Import your recording first",
        hint: episodeCount
          ? "Add a Riverside link or synced speaker files, assign Host / Guest roles, and add social links before style or brand work."
          : "This show has no episodes yet. Import a Riverside link or separate synced speaker files, assign each to Host, Guest 1, or Guest 2, and add social links — then continue to audio polish and style.",
        actionLabel: episodeCount ? "New episode →" : "Set up first episode →",
      },
      secondary: {
        id: "brand-kit",
        title: "Brand kit (optional)",
        hint: hasBrandKit
          ? "Reusable logo, colors, and captions — edit any time after your first import."
          : "Set up later. Episode import and speaker context come first.",
        actionLabel: hasBrandKit ? "Edit brand kit" : "Set up brand kit later",
      },
    };
  }

  const api = {
    FIRST_STEP,
    firstStepAfterCreateShow,
    showDetailSections,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcShowOnboarding = api;
}(typeof window !== "undefined" ? window : globalThis));

"use strict";

// Episode import onboarding for Podcast Design Canvas (#73).
//
// Keeps the primary new-show path on episode import — Riverside link or synced speaker
// files, role assignment, and social links — before brand kit or template polish.
// DOM-free so UI wiring and tests share one source of truth.
(function (global) {
  const SECTION_ORDER = ["episode-import", "episodes", "brand-kit"];

  const NEXT_AFTER_SHOW_CREATE = "episode-setup";

  function afterShowCreated(show) {
    return {
      showId: show && show.id ? show.id : "",
      showName: show && show.name ? show.name : "",
      nextAction: NEXT_AFTER_SHOW_CREATE,
      headline: "Import your episode first",
      message: "Add a Riverside link or synced speaker files, assign Host and guests, and add optional social links before brand or template work.",
    };
  }

  function showDetailSectionOrder() {
    return SECTION_ORDER.slice();
  }

  function episodeImportBeforeBrandKit() {
    return true;
  }

  function primaryLibraryAction() {
    return {
      id: "start-episode",
      label: "Start episode →",
      secondaryLabel: "+ New show",
      hint: "Import recordings and assign speakers first — brand kits come after episode setup.",
    };
  }

  function episodeSetupStepLabel() {
    return "Step 1 of 8 · Import episode & speakers";
  }

  const api = {
    SECTION_ORDER,
    NEXT_AFTER_SHOW_CREATE,
    afterShowCreated,
    showDetailSectionOrder,
    episodeImportBeforeBrandKit,
    primaryLibraryAction,
    episodeSetupStepLabel,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcEpisodeImportFlow = api;
}(typeof window !== "undefined" ? window : globalThis));

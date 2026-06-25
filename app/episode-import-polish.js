"use strict";

// Episode import polish for Podcast Design Canvas (#77).
//
// Shared layout tokens and CTA class names so the library → create show → import
// path uses consistent spacing and button hierarchy. DOM-free for tests and UI.
(function (global) {
  const PRIMARY_CTA_CLASS = "primary";
  const SECONDARY_CTA_CLASS = "ghost";

  const SETUP_FORM_CLASS = "setup setup-import";
  const SETUP_SECTION_CLASS = "card setup-section";
  const SPEAKERS_STACK_CLASS = "speakers-stack";
  const SPEAKER_CARD_CLASS = "speaker speaker-source-card";
  const SETUP_ACTIONS_CLASS = "actions setup-actions";

  const LAYOUT = {
    sectionGapPx: 24,
    speakerStackGapPx: 18,
    speakerCardPaddingPx: 22,
    fieldGapPx: 18,
    mobileBreakpointPx: 640,
  };

  const PRIMARY_LABELS = {
    createShow: "Create show & import episode →",
    continueImport: "Continue to audio polish →",
    startBlankEpisode: "Start episode →",
    newEpisode: "New episode →",
  };

  function primaryCtaClass() {
    return PRIMARY_CTA_CLASS;
  }

  function secondaryCtaClass() {
    return SECONDARY_CTA_CLASS;
  }

  function setupClasses() {
    return {
      form: SETUP_FORM_CLASS,
      section: SETUP_SECTION_CLASS,
      speakersStack: SPEAKERS_STACK_CLASS,
      speakerCard: SPEAKER_CARD_CLASS,
      actions: SETUP_ACTIONS_CLASS,
    };
  }

  function layoutSpacing() {
    return Object.assign({}, LAYOUT);
  }

  function consistentPrimaryLabels() {
    return Object.assign({}, PRIMARY_LABELS);
  }

  function importPathScreens() {
    return ["library", "new-show", "show-detail", "episode-setup"];
  }

  const api = {
    PRIMARY_CTA_CLASS,
    SECONDARY_CTA_CLASS,
    primaryCtaClass,
    secondaryCtaClass,
    setupClasses,
    layoutSpacing,
    consistentPrimaryLabels,
    importPathScreens,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcEpisodeImportPolish = api;
}(typeof window !== "undefined" ? window : globalThis));

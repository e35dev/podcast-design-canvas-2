"use strict";

// Show identity prefill for Podcast Design Canvas (#57).
//
// Connects the show library, brand kit, and saved template into repeat-production:
// starting a new episode from a show carries host/social defaults, brand colors,
// layout/style, and canvas identity through setup, preview, workspace, and export.
(function (global) {
  function setupApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./episode-setup.js");
    }
    return (typeof window !== "undefined" ? window : globalThis).PdcEpisodeSetup;
  }

  function styleApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./episode-style.js");
    }
    return (typeof window !== "undefined" ? window : globalThis).PdcEpisodeStyle;
  }

  function templatesApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./show-templates.js");
    }
    return (typeof window !== "undefined" ? window : globalThis).PdcShowTemplates;
  }

  function brandKitApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./show-brand-kit.js");
    }
    return (typeof window !== "undefined" ? window : globalThis).PdcShowBrandKit;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function cloneSpeaker(speaker) {
    const ES = setupApi();
    const base = ES ? ES.createSpeaker(speaker && speaker.role) : {
      name: "",
      role: "",
      fileName: "",
      fileSize: 0,
      trackLabel: "",
      social: { website: "", twitter: "", instagram: "", linkedin: "" },
    };
    const src = speaker || {};
    base.name = typeof src.name === "string" ? src.name : "";
    base.role = src.role || base.role;
    base.trackLabel = typeof src.trackLabel === "string" ? src.trackLabel : "";
    base.fileName = "";
    base.fileSize = 0;
    base.social = Object.assign(base.social, clone(src.social || {}));
    return base;
  }

  function suggestEpisodeName(show, episodeCount) {
    const name = show && show.name ? show.name : "Episode";
    const n = (episodeCount || 0) + 1;
    return `${name} — Episode ${n}`;
  }

  function applyToDraft(show, draft) {
    const ES = setupApi();
    const base = draft && typeof draft === "object" ? clone(draft) : (ES ? ES.createDraft() : draft);
    if (!show) {
      return { draft: base, fromShow: false };
    }
    const episodeCount = Array.isArray(show.episodes) ? show.episodes.length : 0;
    if (!base.episodeName) {
      base.episodeName = suggestEpisodeName(show, episodeCount);
    }
    if (show.defaultSourceMode) {
      base.sourceMode = show.defaultSourceMode;
    }
    if (Array.isArray(show.defaultSpeakers) && show.defaultSpeakers.length) {
      base.speakers = show.defaultSpeakers.map(cloneSpeaker);
    }
    return {
      draft: base,
      fromShow: true,
      showId: show.id,
      showName: show.name,
    };
  }

  function resolvePresetId(show) {
    const STY = styleApi();
    if (!STY || !show || !show.presetName) {
      return null;
    }
    const preset = STY.STYLE_PRESETS.find((item) => item.name === show.presetName || item.id === show.presetName);
    return preset ? preset.id : null;
  }

  function applyStartContext(show, templateStore, episodeSummary) {
    const STY = styleApi();
    const TM = templatesApi();
    const BK = brandKitApi();
    const result = {
      styleSelection: STY ? STY.createSelection() : null,
      activeTemplateId: null,
      canvasDoc: null,
      appliedStyle: null,
      activeBrandKit: show && show.brandKit ? clone(show.brandKit) : null,
      layoutCustomized: false,
    };
    if (!show) {
      return result;
    }

    const presetId = resolvePresetId(show);
    if (presetId && result.styleSelection) {
      result.styleSelection.presetId = presetId;
    }

    if (show.templateId && TM && templateStore) {
      const template = TM.getTemplate(templateStore, show.templateId);
      if (template) {
        result.activeTemplateId = show.templateId;
        const styleFromTemplate = TM.styleSelectionFromCanvas(template.canvas);
        if (styleFromTemplate && result.styleSelection) {
          result.styleSelection.presetId = styleFromTemplate.presetId || result.styleSelection.presetId;
          result.styleSelection.layout = styleFromTemplate.layout || result.styleSelection.layout;
          result.styleSelection.pacing = styleFromTemplate.pacing || result.styleSelection.pacing;
          result.layoutCustomized = result.styleSelection.layout !== "auto";
        }
        if (episodeSummary) {
          result.canvasDoc = TM.applyTemplateForEpisode(
            template,
            episodeSummary,
            result.styleSelection,
          );
        } else {
          result.canvasDoc = TM.applyTemplate(template);
        }
        if (BK && result.activeBrandKit && result.canvasDoc) {
          result.canvasDoc = BK.applyToCanvas(result.canvasDoc, result.activeBrandKit);
        }
      }
    }

    return result;
  }

  function applyAfterSetup(show, templateStore, episodeSummary, state) {
    const ctx = applyStartContext(show, templateStore, episodeSummary);
    const STY = styleApi();
    const BK = brandKitApi();
    if (STY && ctx.styleSelection && episodeSummary) {
      ctx.appliedStyle = STY.summarizeStyle(ctx.styleSelection, episodeSummary.speakerCount);
      if (BK && ctx.activeBrandKit) {
        ctx.appliedStyle = BK.applyToStyleSummary(ctx.appliedStyle, ctx.activeBrandKit);
      }
    }
    return ctx;
  }

  function captureDefaultsFromDraft(draft) {
    const data = draft || {};
    return {
      defaultSourceMode: data.sourceMode || "riverside",
      defaultSpeakers: Array.isArray(data.speakers)
        ? data.speakers.map((speaker) => cloneSpeaker(speaker))
        : [],
    };
  }

  function buildIdentitySummary(show) {
    if (!show) {
      return {
        active: false,
        headline: "",
        detailLine: "",
        workspaceLine: "",
      };
    }
    const parts = [show.name];
    if (show.templateName) {
      parts.push(show.templateName);
    }
    if (show.presetName) {
      parts.push(show.presetName);
    }
    const BK = brandKitApi();
    if (show.brandKit && BK) {
      const brand = BK.summarizeBrandKit(show.brandKit);
      if (brand.identityLine && brand.identityLine !== "No brand kit configured") {
        parts.push(brand.identityLine);
      }
    }
    return {
      active: true,
      showId: show.id,
      showName: show.name,
      headline: `Creating for ${show.name}`,
      detailLine: parts.slice(1).join(" · "),
      workspaceLine: `Show identity: ${parts.join(" · ")}`,
    };
  }

  const api = {
    cloneSpeaker,
    suggestEpisodeName,
    applyToDraft,
    applyStartContext,
    applyAfterSetup,
    captureDefaultsFromDraft,
    buildIdentitySummary,
    resolvePresetId,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcShowIdentity = api;
}(typeof window !== "undefined" ? window : globalThis));

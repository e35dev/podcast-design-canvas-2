"use strict";

// Full-episode review and approval model for Podcast Design Canvas (#37).
//
// The final confidence check before export: roll the whole episode up into one
// end-to-end review — speakers, visual style, show template, audio polish,
// contextual text improvements, visual moments, captions, and export readiness —
// then call out anything missing or incomplete with clear creator-facing messages
// and a resolve action that points back to the right step. Required publish-ready
// checks gate approval; recommended items surface as warnings without blocking.
//
// DOM-free on purpose so the review screen and the tests share one source of truth.
// No build step, no dependencies.
(function (global) {
  // Statuses a review item can carry.
  //   ready     — done, nothing to do
  //   blocked   — a REQUIRED publish-ready check that is not satisfied (blocks approval)
  //   attention — a recommended item that is missing/incomplete (a warning, never blocks)
  const STATUS = { READY: "ready", BLOCKED: "blocked", ATTENTION: "attention" };

  // The resolve targets the review can hand back to. The UI maps these to screens.
  const STEPS = {
    SETUP: "setup",
    CONTEXT: "context",
    AUDIO: "audio",
    STYLE: "style",
    CANVAS: "canvas",
    MOMENTS: "moments",
    EXPORT: "export",
  };

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  // Inspect the assigned speakers. Required: at least one speaker, each with a name
  // and a role, so the layout and captions know who is talking.
  function reviewSpeakers(episode) {
    const speakers = asArray(episode.speakers);
    if (!speakers.length) {
      return {
        status: STATUS.BLOCKED,
        message: "No speakers are set up yet. Add your speaker sources to build the episode.",
        action: { label: "Set up speakers", step: STEPS.SETUP },
      };
    }
    const unnamed = [];
    const unroled = [];
    speakers.forEach((speaker, index) => {
      const sp = speaker || {};
      if (!trim(sp.name)) {
        unnamed.push(index + 1);
      }
      if (!trim(sp.role)) {
        unroled.push(index + 1);
      }
    });
    if (unnamed.length || unroled.length) {
      const parts = [];
      if (unnamed.length) {
        parts.push(`name${unnamed.length === 1 ? "" : "s"} for speaker ${unnamed.join(", ")}`);
      }
      if (unroled.length) {
        parts.push(`role${unroled.length === 1 ? "" : "s"} for speaker ${unroled.join(", ")}`);
      }
      return {
        status: STATUS.BLOCKED,
        message: `Add the missing ${parts.join(" and ")} so the edit knows who's on screen.`,
        action: { label: "Edit speakers", step: STEPS.SETUP },
      };
    }
    const roles = speakers.map((sp) => trim(sp.role)).filter(Boolean);
    return {
      status: STATUS.READY,
      message: `${speakers.length} speaker${speakers.length === 1 ? "" : "s"} assigned — ${roles.join(", ")}.`,
      action: { label: "Edit speakers", step: STEPS.SETUP },
    };
  }

  // Required: an audio polish preset must be applied before publishing.
  function reviewAudio(audio) {
    if (audio && trim(audio.presetName)) {
      return {
        status: STATUS.READY,
        message: `Audio polished with the ${audio.presetName} preset${audio.treatmentLine ? ` (${audio.treatmentLine})` : ""}.`,
        action: { label: "Change audio", step: STEPS.AUDIO },
      };
    }
    return {
      status: STATUS.BLOCKED,
      message: "Audio has not been polished yet. Pick a quality preset so speakers sound clean and level.",
      action: { label: "Polish audio", step: STEPS.AUDIO },
    };
  }

  // Required: a visual style must be applied so the episode has a coherent look.
  function reviewStyle(style) {
    if (style && trim(style.presetName)) {
      const detail = [style.layoutLabel, style.pacingLabel].filter(Boolean).join(" · ");
      return {
        status: STATUS.READY,
        message: `Visual style set to ${style.presetName}${detail ? ` · ${detail}` : ""}.`,
        action: { label: "Change style", step: STEPS.STYLE },
      };
    }
    return {
      status: STATUS.BLOCKED,
      message: "No visual style is applied yet. Choose a preset look so the episode is visually coherent.",
      action: { label: "Choose a style", step: STEPS.STYLE },
    };
  }

  // Recommended: a reusable show template keeps a consistent identity across episodes.
  function reviewTemplate(templateName) {
    const name = trim(templateName);
    if (name) {
      return {
        status: STATUS.READY,
        message: `Show template "${name}" applied.`,
        action: { label: "Edit template", step: STEPS.CANVAS },
      };
    }
    return {
      status: STATUS.ATTENTION,
      message: "No show template saved. Save one to reuse this look on future episodes (optional).",
      action: { label: "Open canvas editor", step: STEPS.CANVAS },
    };
  }

  // Recommended: contextual text improvements (approved social context) sharpen names,
  // spellings, brands, and on-screen references.
  function reviewContext(contextSummary) {
    if (contextSummary && contextSummary.approved) {
      const count = contextSummary.speakerCount || 0;
      return {
        status: STATUS.READY,
        message: `Contextual text improvements approved for ${count} speaker${count === 1 ? "" : "s"}.`,
        action: { label: "Review context", step: STEPS.CONTEXT },
      };
    }
    return {
      status: STATUS.ATTENTION,
      message: "Contextual text improvements aren't approved yet. Confirm names and spellings for sharper captions (optional).",
      action: { label: "Review context", step: STEPS.CONTEXT },
    };
  }

  // Recommended: visual moments (captions, titles, b-roll, callouts) make a long
  // episode feel deliberately produced.
  function reviewVisualMoments(moments) {
    const total = moments && typeof moments.total === "number" ? moments.total : 0;
    if (total > 0) {
      const live = moments.visibleCount || 0;
      return {
        status: STATUS.READY,
        message: `${live} of ${total} visual moment${total === 1 ? "" : "s"} live across the episode.`,
        action: { label: "Edit moments", step: STEPS.MOMENTS },
      };
    }
    return {
      status: STATUS.ATTENTION,
      message: "No visual moments placed yet. Add title cards, b-roll, or callouts to keep a long episode engaging (optional).",
      action: { label: "Add visual moments", step: STEPS.MOMENTS },
    };
  }

  // Recommended: captions. A publish-ready long-form episode should be captioned, but a
  // missing caption is a warning the creator can override rather than a hard block.
  function reviewCaptions(moments) {
    const captionCount = moments && moments.counts && typeof moments.counts.caption === "number"
      ? moments.counts.caption
      : 0;
    if (captionCount > 0) {
      return {
        status: STATUS.READY,
        message: `${captionCount} caption moment${captionCount === 1 ? "" : "s"} placed.`,
        action: { label: "Edit captions", step: STEPS.MOMENTS },
      };
    }
    return {
      status: STATUS.ATTENTION,
      message: "No captions added yet. Captions make a long episode accessible and clear — add at least one (recommended).",
      action: { label: "Add captions", step: STEPS.MOMENTS },
    };
  }

  // Required: export readiness mirrors the export step's own gate (audio + style),
  // so the review never says "ready" while export would refuse to start.
  function reviewExportReadiness(audio, style) {
    const audioReady = Boolean(audio && trim(audio.presetName));
    const styleReady = Boolean(style && trim(style.presetName));
    if (audioReady && styleReady) {
      return {
        status: STATUS.READY,
        message: "Export checks pass — this episode can render a publish-ready file.",
        action: { label: "Go to export", step: STEPS.EXPORT },
      };
    }
    const needs = [];
    if (!audioReady) {
      needs.push("polish your audio");
    }
    if (!styleReady) {
      needs.push("choose a visual style");
    }
    return {
      status: STATUS.BLOCKED,
      message: `Not ready to export yet — please ${needs.join(" and ")} first.`,
      action: { label: needs.length === 1 && !audioReady ? "Polish audio" : "Choose a style", step: !audioReady ? STEPS.AUDIO : STEPS.STYLE },
    };
  }

  // Build the full end-to-end review from the episode summary and the rolled-up context
  // (audio polish summary, applied style, template name, visual-moments summary, and the
  // social-context summary). Every item is derived — never fabricated — so the review
  // always reflects the real choices the creator made.
  function buildReview(episodeSummary, context) {
    const episode = episodeSummary || {};
    const ctx = context || {};
    const audio = ctx.audioPolish || null;
    const style = ctx.appliedStyle || null;
    const moments = ctx.momentsSummary || null;
    const contextSummary = ctx.contextSummary || null;
    const templateName = trim(ctx.templateName);

    const definitions = [
      { id: "speakers", area: "Speakers", label: "Speakers & roles", required: true, result: reviewSpeakers(episode) },
      { id: "audio", area: "Audio", label: "Audio polish", required: true, result: reviewAudio(audio) },
      { id: "style", area: "Style", label: "Visual style", required: true, result: reviewStyle(style) },
      { id: "template", area: "Template", label: "Show template", required: false, result: reviewTemplate(templateName) },
      { id: "context", area: "Context", label: "Contextual text improvements", required: false, result: reviewContext(contextSummary) },
      { id: "moments", area: "Visual moments", label: "Visual moments", required: false, result: reviewVisualMoments(moments) },
      { id: "captions", area: "Captions", label: "Captions", required: false, result: reviewCaptions(moments) },
      { id: "export", area: "Export", label: "Export readiness", required: true, result: reviewExportReadiness(audio, style) },
    ];

    const items = definitions.map((def) => ({
      id: def.id,
      area: def.area,
      label: def.label,
      required: def.required,
      status: def.result.status,
      message: def.result.message,
      action: def.result.action || null,
    }));

    const requiredOutstanding = items.filter((item) => item.required && item.status === STATUS.BLOCKED);
    const recommendedOutstanding = items.filter((item) => !item.required && item.status === STATUS.ATTENTION);
    const canApprove = requiredOutstanding.length === 0;

    return {
      episodeName: trim(episode.episodeName),
      items,
      requiredOutstanding,
      recommendedOutstanding,
      canApprove,
      publishReady: canApprove,
      approved: false,
      approvedAt: null,
    };
  }

  // A short, creator-facing reason the episode cannot be approved yet — built from the
  // outstanding required checks. Empty string when the episode can be approved.
  function blockingMessage(review) {
    const outstanding = review && Array.isArray(review.requiredOutstanding) ? review.requiredOutstanding : [];
    if (!outstanding.length) {
      return "";
    }
    const labels = outstanding.map((item) => item.label.toLowerCase());
    if (labels.length === 1) {
      return `Resolve ${labels[0]} before approving this episode.`;
    }
    const last = labels[labels.length - 1];
    const rest = labels.slice(0, -1);
    return `Resolve ${rest.join(", ")} and ${last} before approving this episode.`;
  }

  // Approve the episode for publish. Only succeeds when every required check passes;
  // otherwise the review stays unapproved and carries a creator-facing error.
  function approveReview(review) {
    const base = review && typeof review === "object" ? clone(review) : buildReview({}, {});
    if (!base.canApprove) {
      return Object.assign({}, base, {
        approved: false,
        approvedAt: null,
        error: blockingMessage(base) || "Required publish-ready checks have not passed yet.",
      });
    }
    return Object.assign({}, base, {
      approved: true,
      approvedAt: Date.now(),
      error: "",
    });
  }

  // Drop an approval (e.g. after the creator goes back and changes something), so the
  // gate re-locks until the episode is reviewed again.
  function revokeApproval(review) {
    const base = review && typeof review === "object" ? clone(review) : buildReview({}, {});
    return Object.assign({}, base, { approved: false, approvedAt: null, error: "" });
  }

  // Headline counts + summary lines for the review screen and the export roll-up.
  function summarizeReview(review) {
    const items = review && Array.isArray(review.items) ? review.items : [];
    const readyCount = items.filter((item) => item.status === STATUS.READY).length;
    const blockedCount = items.filter((item) => item.status === STATUS.BLOCKED).length;
    const warningCount = items.filter((item) => item.status === STATUS.ATTENTION).length;
    const lines = items.map((item) => `${item.label}: ${item.message}`);
    const approved = Boolean(review && review.approved);
    return {
      approved,
      canApprove: Boolean(review && review.canApprove),
      readyCount,
      blockedCount,
      warningCount,
      total: items.length,
      lines,
      headline: approved
        ? "Episode approved — ready to publish."
        : review && review.canApprove
          ? "All required checks pass — ready to approve."
          : blockingMessage(review) || "Resolve the required checks to approve this episode.",
      reviewLine: approved
        ? `Review: approved (${readyCount} of ${items.length} checks ready)`
        : "",
    };
  }

  const api = {
    STATUS,
    STEPS,
    buildReview,
    blockingMessage,
    approveReview,
    revokeApproval,
    summarizeReview,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcEpisodeReview = api;
}(typeof window !== "undefined" ? window : globalThis));

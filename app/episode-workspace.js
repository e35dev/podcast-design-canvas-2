"use strict";

// Guided end-to-end episode workspace for Podcast Design Canvas (#40).
//
// Connects setup, style, audio, moments, template, review, and export into one
// creator-facing production flow with plain-language stage status and summaries.
// DOM-free so the workspace screen and tests share one source of truth.
(function (global) {
  const STAGE_ORDER = ["setup", "style", "audio", "moments", "template", "transcript", "review", "package", "export"];

  const ACTION_TARGETS = {
    setup: "setup",
    style: "style",
    audio: "audio",
    moments: "moments",
    template: "canvas",
    transcript: "transcript",
    review: "review",
    package: "package",
    export: "export",
  };

  const STATUS = {
    PENDING: "pending",
    ACTIVE: "active",
    ATTENTION: "attention",
    COMPLETE: "complete",
  };

  function stage(id, label, status, summary, actionLabel, actionTarget) {
    return {
      id: id,
      label: label,
      status: status,
      summary: summary,
      actionLabel: actionLabel,
      actionTarget: actionTarget || ACTION_TARGETS[id] || id,
    };
  }

  function buildStages(episodeSummary, ctx) {
    const episode = episodeSummary || {};
    const context = ctx || {};
    const stages = [];

    // Setup -------------------------------------------------------------------
    const setupComplete = Boolean(episode.episodeName) && (episode.speakerCount || 0) > 0;
    let setupSummary = setupComplete
      ? `${episode.speakerCount} speaker${episode.speakerCount === 1 ? "" : "s"} · ${episode.sourceModeLabel || "sources"}`
      : "Add your episode name, sources, and speaker roles.";
    if (setupComplete && episode.socialLinkCount > 0) {
      setupSummary += context.contextApproved
        ? " · Social context approved"
        : " · Social context needs review";
    }
    stages.push(stage(
      "setup",
      "Episode setup",
      setupComplete ? STATUS.COMPLETE : STATUS.ACTIVE,
      setupSummary,
      setupComplete ? "Edit setup" : "Continue setup",
      ACTION_TARGETS.setup,
    ));

    // Style -------------------------------------------------------------------
    const styleApplied = context.appliedStyle && context.appliedStyle.presetName;
    stages.push(stage(
      "style",
      "Visual style",
      styleApplied
        ? STATUS.COMPLETE
        : setupComplete ? STATUS.ACTIVE : STATUS.PENDING,
      styleApplied
        ? `${context.appliedStyle.presetName} · ${context.appliedStyle.layoutLabel || "layout"}`
        : "Pick a preset look and pacing for your speakers.",
      styleApplied ? "Change style" : "Choose style",
      ACTION_TARGETS.style,
    ));

    // Audio -------------------------------------------------------------------
    const audioApplied = context.audioPolish && context.audioPolish.presetName;
    stages.push(stage(
      "audio",
      "Audio polish",
      audioApplied
        ? STATUS.COMPLETE
        : setupComplete ? STATUS.ACTIVE : STATUS.PENDING,
      audioApplied
        ? `${context.audioPolish.presetName} — ${context.audioPolish.treatmentLine || "treatment applied"}`
        : "Choose a sound quality preset for every speaker track.",
      audioApplied ? "Change audio" : "Polish audio",
      ACTION_TARGETS.audio,
    ));

    // Visual moments ----------------------------------------------------------
    const ms = context.momentsSummary || {};
    const momentTotal = ms.total || 0;
    const momentVisible = ms.visibleCount || 0;
    stages.push(stage(
      "moments",
      "Visual moments",
      momentTotal > 0
        ? STATUS.COMPLETE
        : styleApplied && audioApplied ? STATUS.ATTENTION : STATUS.PENDING,
      momentTotal > 0
        ? `${momentVisible} of ${momentTotal} moment${momentTotal === 1 ? "" : "s"} live`
        : "Add captions, titles, b-roll, and callouts at key points.",
      momentTotal > 0 ? "Edit moments" : "Add moments",
      ACTION_TARGETS.moments,
    ));

    // Show template -----------------------------------------------------------
    const templateName = context.templateName || "";
    stages.push(stage(
      "template",
      "Show template",
      templateName
        ? STATUS.COMPLETE
        : styleApplied ? STATUS.ATTENTION : STATUS.PENDING,
      templateName
        ? `"${templateName}" saved for reuse`
        : "Personalize the canvas and save a reusable show identity.",
      templateName ? "Edit canvas" : "Open canvas editor",
      ACTION_TARGETS.template,
    ));

    // Transcript & caption review (#63) --------------------------------------
    const transcriptApproved = Boolean(context.transcriptReviewApproved);
    let transcriptStatus = STATUS.PENDING;
    if (transcriptApproved) {
      transcriptStatus = STATUS.COMPLETE;
    } else if (templateName || styleApplied) {
      transcriptStatus = styleApplied && audioApplied ? STATUS.ACTIVE : STATUS.PENDING;
    }
    stages.push(stage(
      "transcript",
      "Transcript review",
      transcriptStatus,
      transcriptApproved
        ? "Corrections reviewed and ready for publish review."
        : styleApplied && audioApplied
          ? "Fix names, brands, topics, and caption text before publishing."
          : "Complete audio, style, and template steps first.",
      transcriptApproved ? "View corrections" : "Review transcript",
      ACTION_TARGETS.transcript,
    ));

    // Publish review ----------------------------------------------------------
    const exportReady = Boolean(context.exportReady);
    const transcriptReviewApproved = Boolean(context.transcriptReviewApproved);
    const reviewApproved = Boolean(context.publishReviewApproved);
    let reviewStatus = STATUS.PENDING;
    if (reviewApproved) {
      reviewStatus = STATUS.COMPLETE;
    } else if (exportReady && transcriptReviewApproved) {
      reviewStatus = STATUS.ACTIVE;
    }
    stages.push(stage(
      "review",
      "Publish review",
      reviewStatus,
      reviewApproved
        ? "Episode approved — ready to export."
        : exportReady && transcriptReviewApproved
          ? "Run the full-episode confidence check before exporting."
          : "Complete transcript review and core prep before reviewing.",
      reviewApproved ? "View review" : "Review episode",
      ACTION_TARGETS.review,
    ));

    // Publish package -------------------------------------------------------
    const packageReady = Boolean(context.publishPackageReady);
    let packageStatus = STATUS.PENDING;
    if (packageReady) {
      packageStatus = STATUS.COMPLETE;
    } else if (reviewApproved) {
      packageStatus = STATUS.ACTIVE;
    }
    stages.push(stage(
      "package",
      "Publish package",
      packageStatus,
      packageReady
        ? "Episode package is editable and export-ready."
        : reviewApproved
          ? "Build package metadata, chapter list, credits, and thumbnail options."
          : "Approve the publish review to unlock package building.",
      packageReady ? "View package" : "Build package",
      ACTION_TARGETS.package,
    ));

    // Export ------------------------------------------------------------------
    const exportDone = context.exportStatus === "ready";
    let exportStatus = STATUS.PENDING;
    if (exportDone) {
      exportStatus = STATUS.COMPLETE;
    } else if (reviewApproved && exportReady) {
      exportStatus = STATUS.ACTIVE;
    }
    stages.push(stage(
      "export",
      "Export & publish",
      exportStatus,
      exportDone
        ? `Ready to download${context.exportDownloadName ? `: ${context.exportDownloadName}` : ""}`
        : reviewApproved && packageReady
          ? "Choose platform, resolution, and caption options."
          : reviewApproved
            ? "Build the publish package to unlock export."
            : "Approve the publish review to unlock export.",
      exportDone ? "View export" : "Export episode",
      ACTION_TARGETS.export,
    ));

    return stages;
  }

  function buildWorkspace(episodeSummary, ctx) {
    const stages = buildStages(episodeSummary, ctx);
    const completeCount = stages.filter((item) => item.status === STATUS.COMPLETE).length;
    const attentionCount = stages.filter((item) => item.status === STATUS.ATTENTION).length;
    const activeStage = stages.find((item) => item.status === STATUS.ACTIVE)
      || stages.find((item) => item.status === STATUS.ATTENTION)
      || stages[stages.length - 1];

    return {
      episodeName: (episodeSummary && episodeSummary.episodeName) || "",
      stages: stages,
      completeCount: completeCount,
      totalStages: stages.length,
      attentionCount: attentionCount,
      currentStageId: activeStage ? activeStage.id : STAGE_ORDER[0],
      progressLine: `${completeCount} of ${stages.length} stages complete${attentionCount ? ` · ${attentionCount} recommended` : ""}`,
    };
  }

  function getStage(workspace, id) {
    const stages = workspace && Array.isArray(workspace.stages) ? workspace.stages : [];
    return stages.find((item) => item.id === id) || null;
  }

  function summarizeWorkspace(workspace) {
    const ws = workspace || buildWorkspace({}, {});
    const current = getStage(ws, ws.currentStageId);
    return {
      progressLine: ws.progressLine,
      completeCount: ws.completeCount,
      totalStages: ws.totalStages,
      currentStageId: ws.currentStageId,
      currentStageLabel: current ? current.label : "",
      workspaceLine: current
        ? `Next: ${current.label} — ${current.summary}`
        : ws.progressLine,
    };
  }

  const api = {
    STAGE_ORDER,
    ACTION_TARGETS,
    STATUS,
    buildStages,
    buildWorkspace,
    getStage,
    summarizeWorkspace,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcEpisodeWorkspace = api;
}(typeof window !== "undefined" ? window : globalThis));

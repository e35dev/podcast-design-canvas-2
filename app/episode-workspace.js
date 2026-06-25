"use strict";

// Guided end-to-end episode workspace for Podcast Design Canvas (#40, #67).
//
// Connects setup, social context, transcript correction, style, audio, smart b-roll,
// moments, template, review, and export into one creator-facing production flow.
// DOM-free so the workspace screen and tests share one source of truth.
(function (global) {
  const STAGE_ORDER = [
    "setup", "context", "correction", "style", "audio",
    "broll", "moments", "template", "review", "export",
  ];

  const ACTION_TARGETS = {
    setup: "setup",
    context: "context",
    correction: "correction",
    style: "style",
    audio: "audio",
    broll: "broll",
    moments: "moments",
    template: "canvas",
    review: "review",
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

    const setupComplete = Boolean(episode.episodeName) && (episode.speakerCount || 0) > 0;
    const needsContext = (episode.socialLinkCount || 0) > 0;
    const contextApproved = !needsContext || Boolean(context.contextApproved);
    const correctionApproved = Boolean(context.correctionApproved);
    const styleApplied = context.appliedStyle && context.appliedStyle.presetName;
    const audioApplied = context.audioPolish && context.audioPolish.presetName;
    const bs = context.brollSummary || {};
    const brollAccepted = (bs.acceptedCount || 0) > 0;
    const brollGenerated = Boolean(bs.generated);

    // Setup -------------------------------------------------------------------
    let setupSummary = setupComplete
      ? `${episode.speakerCount} speaker${episode.speakerCount === 1 ? "" : "s"} · ${episode.sourceModeLabel || "sources"}`
      : "Add your episode name, sources, and speaker roles.";
    if (setupComplete && needsContext) {
      setupSummary += contextApproved
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

    // Social context ----------------------------------------------------------
    stages.push(stage(
      "context",
      "Social context",
      !needsContext || contextApproved ? STATUS.COMPLETE : setupComplete ? STATUS.ACTIVE : STATUS.PENDING,
      !needsContext
        ? "No social links on this episode."
        : contextApproved
          ? "Speaker names and brands approved from social links."
          : "Review names, brands, and spelling from social links.",
      contextApproved || !needsContext ? "Review context" : "Approve context",
      ACTION_TARGETS.context,
    ));

    // Transcript correction -----------------------------------------------------
    const correctionReady = setupComplete && contextApproved;
    stages.push(stage(
      "correction",
      "Transcript & captions",
      correctionApproved
        ? STATUS.COMPLETE
        : correctionReady ? STATUS.ACTIVE : STATUS.PENDING,
      correctionApproved
        ? "Speaker labels and caption lines approved."
        : "Fix speaker names, brands, and caption text once for the whole episode.",
      correctionApproved ? "Edit corrections" : "Review transcript",
      ACTION_TARGETS.correction,
    ));

    // Style -------------------------------------------------------------------
    const styleReady = correctionApproved;
    stages.push(stage(
      "style",
      "Visual style",
      styleApplied
        ? STATUS.COMPLETE
        : styleReady ? STATUS.ACTIVE : STATUS.PENDING,
      styleApplied
        ? `${context.appliedStyle.presetName} · ${context.appliedStyle.layoutLabel || "layout"}`
        : "Pick a preset look and pacing for your speakers.",
      styleApplied ? "Change style" : "Choose style",
      ACTION_TARGETS.style,
    ));

    // Audio -------------------------------------------------------------------
    stages.push(stage(
      "audio",
      "Audio polish",
      audioApplied
        ? STATUS.COMPLETE
        : styleReady ? STATUS.ACTIVE : STATUS.PENDING,
      audioApplied
        ? `${context.audioPolish.presetName} — ${context.audioPolish.treatmentLine || "treatment applied"}`
        : "Choose a sound quality preset for every speaker track.",
      audioApplied ? "Change audio" : "Polish audio",
      ACTION_TARGETS.audio,
    ));

    // Smart b-roll ------------------------------------------------------------
    const brollReady = correctionApproved && styleApplied && audioApplied;
    stages.push(stage(
      "broll",
      "Smart b-roll",
      brollAccepted
        ? STATUS.COMPLETE
        : brollReady ? STATUS.ACTIVE : STATUS.PENDING,
      brollAccepted
        ? `${bs.acceptedCount} accepted overlay${bs.acceptedCount === 1 ? "" : "s"}`
        : brollGenerated
          ? `${bs.pendingCount || 0} suggestion${bs.pendingCount === 1 ? "" : "s"} ready to review`
          : "Generate transcript-tied b-roll from social context and captions.",
      brollAccepted ? "Review b-roll" : brollGenerated ? "Review suggestions" : "Generate b-roll",
      ACTION_TARGETS.broll,
    ));

    // Visual moments ----------------------------------------------------------
    const ms = context.momentsSummary || {};
    const momentTotal = ms.total || 0;
    const momentVisible = ms.visibleCount || 0;
    const momentsReady = brollAccepted || brollGenerated;
    stages.push(stage(
      "moments",
      "Visual moments",
      momentTotal > 0
        ? STATUS.COMPLETE
        : momentsReady && styleApplied && audioApplied ? STATUS.ATTENTION : STATUS.PENDING,
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

    // Publish review ----------------------------------------------------------
    const exportReady = Boolean(context.exportReady);
    const reviewApproved = Boolean(context.publishReviewApproved);
    let reviewStatus = STATUS.PENDING;
    if (reviewApproved) {
      reviewStatus = STATUS.COMPLETE;
    } else if (exportReady) {
      reviewStatus = STATUS.ACTIVE;
    }
    stages.push(stage(
      "review",
      "Publish review",
      reviewStatus,
      reviewApproved
        ? "Episode approved — ready to export."
        : exportReady
          ? "Run the full-episode confidence check before exporting."
          : "Complete audio and style before reviewing.",
      reviewApproved ? "View review" : "Review episode",
      ACTION_TARGETS.review,
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
        : reviewApproved
          ? "Choose platform, resolution, and caption options."
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

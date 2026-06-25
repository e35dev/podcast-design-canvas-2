"use strict";

// Guided end-to-end workspace model for Podcast Design Canvas (#40).
//
// Connects every existing capability — setup, style, audio, visual moments, template,
// review, and export — into one ordered set of stages. Given the already-summarized state
// of each tool, it reports a plain-language status and a short summary per stage, plus
// overall progress and the next stage to tackle. DOM-free so the workspace screen and the
// tests share one source of truth.
(function (global) {
  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  // Ordered production stages, each with the action label the workspace shows.
  const STAGE_ORDER = [
    { id: "setup",    label: "Set up episode",  action: "Edit setup" },
    { id: "style",    label: "Visual style",    action: "Choose style" },
    { id: "audio",    label: "Audio polish",    action: "Polish audio" },
    { id: "moments",  label: "Visual moments",  action: "Add moments" },
    { id: "template", label: "Show template",   action: "Save template" },
    { id: "review",   label: "Review & approve", action: "Review episode" },
    { id: "export",   label: "Export & publish", action: "Export episode" },
  ];

  // Status vocabulary:
  //   "done"     — completed / a choice is saved
  //   "ready"    — actionable now (its prerequisites are met) but not yet done
  //   "todo"     — not started, prerequisites not yet met
  //   "blocked"  — needs attention (e.g. review found blocking issues)
  function stageStatus(id, ctx) {
    switch (id) {
      case "setup":
        return ctx.setupComplete ? "done" : "ready";
      case "style":
        return ctx.styleName ? "done" : (ctx.setupComplete ? "ready" : "todo");
      case "audio":
        return ctx.audioName ? "done" : (ctx.setupComplete ? "ready" : "todo");
      case "moments":
        return ctx.momentCount ? "done" : (ctx.setupComplete ? "ready" : "todo");
      case "template":
        return ctx.templateName ? "done" : (ctx.styleName ? "ready" : "todo");
      case "review":
        if (ctx.reviewApproved) return "done";
        if (ctx.reviewBlocked) return "blocked";
        return (ctx.styleName && ctx.audioName) ? "ready" : "todo";
      case "export":
        if (ctx.exportReady) return "done";
        return (ctx.reviewApproved || (ctx.styleName && ctx.audioName)) ? "ready" : "todo";
      default:
        return "todo";
    }
  }

  function stageSummary(id, ctx) {
    switch (id) {
      case "setup":
        return ctx.setupComplete
          ? `${ctx.speakerCount || 0} speaker${ctx.speakerCount === 1 ? "" : "s"} · ${ctx.sourceModeLabel || "sources ready"}`
          : "Add an episode name, sources, and speakers.";
      case "style":
        return ctx.styleName ? `${ctx.styleName}${ctx.layoutLabel ? " · " + ctx.layoutLabel : ""}` : "Pick a visual style and layout.";
      case "audio":
        return ctx.audioName ? `${ctx.audioName} treatment` : "Choose an audio polish treatment.";
      case "moments":
        return ctx.momentCount ? `${ctx.momentCount} caption/moment${ctx.momentCount === 1 ? "" : "s"} placed` : "Add captions, titles, or callouts.";
      case "template":
        return ctx.templateName ? `Saved as “${ctx.templateName}”` : "Save this look as a reusable show template.";
      case "review":
        if (ctx.reviewApproved) return "Episode approved and publish-ready.";
        if (ctx.reviewBlocked) return `${ctx.reviewBlockingCount || "Some"} item${ctx.reviewBlockingCount === 1 ? "" : "s"} need attention before approval.`;
        return "Run the full-episode review and approve.";
      case "export":
        return ctx.exportReady
          ? `Exported${ctx.exportFileName ? " · " + ctx.exportFileName : ""}`
          : "Pick publishing options and export.";
      default:
        return "";
    }
  }

  // Build the ordered stage list for the workspace from the aggregated tool state.
  function buildStages(context) {
    const ctx = context || {};
    return STAGE_ORDER.map((stage) => ({
      id: stage.id,
      label: stage.label,
      action: stage.action,
      status: stageStatus(stage.id, ctx),
      summary: stageSummary(stage.id, ctx),
    }));
  }

  // Overall progress roll-up for the workspace header.
  function summarizeProgress(stages) {
    const list = Array.isArray(stages) ? stages : [];
    const done = list.filter((s) => s.status === "done").length;
    const blocked = list.filter((s) => s.status === "blocked");
    const total = list.length;
    // The "current" stage is the first that is not done — what the creator should do next.
    const next = list.find((s) => s.status !== "done") || null;
    return {
      total,
      completed: done,
      percent: total ? Math.round((done / total) * 100) : 0,
      blockedCount: blocked.length,
      nextStageId: next ? next.id : null,
      nextStageLabel: next ? next.label : null,
      complete: done === total,
      headline: done === total
        ? "Every stage complete — your episode is published-ready."
        : `${done} of ${total} stages complete${next ? ` · next: ${next.label}` : ""}.`,
    };
  }

  // Build the workspace in one call from an aggregated context.
  function buildWorkspace(context) {
    const stages = buildStages(context);
    return { stages, progress: summarizeProgress(stages) };
  }

  const api = {
    STAGE_ORDER,
    stageStatus,
    stageSummary,
    buildStages,
    summarizeProgress,
    buildWorkspace,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcEpisodeWorkspace = api;
}(typeof window !== "undefined" ? window : globalThis));

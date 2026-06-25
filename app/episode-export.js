"use strict";

// Episode export model for Podcast Design Canvas (#30).
//
// The final publish step: roll up setup, audio, style, canvas/template, and visual
// moments into a coherent export job with creator-facing platform, resolution, and
// caption choices. DOM-free so the export screen and tests share one source of truth.
(function (global) {
  const PLATFORMS = [
    { id: "youtube", name: "YouTube", tagline: "Landscape long-form publish" },
    { id: "spotify", name: "Spotify / Apple Podcasts", tagline: "Video podcast feeds" },
    { id: "download", name: "Download file", tagline: "Save locally for any platform" },
  ];

  const RESOLUTIONS = [
    { id: "1080p", label: "1080p HD", tagline: "Best for YouTube and large screens" },
    { id: "720p", label: "720p", tagline: "Smaller file, still sharp on mobile" },
  ];

  const CAPTION_MODES = [
    { id: "burn-in", label: "Burn captions in", tagline: "Captions are baked into the video" },
    { id: "sidecar", label: "Separate caption file", tagline: "Video plus .srt for flexible uploads" },
  ];

  const PACKAGE_THUMBNAILS = [
    { id: "title-card", label: "Episode title card", summary: "Episode title and show identity" },
    { id: "speaker-grid", label: "Speaker grid", summary: "Speaker credits in a branded card stack" },
    { id: "moment-highlights", label: "Chapter highlights", summary: "Top moments with large title treatment" },
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getPlatform(id) {
    return PLATFORMS.find((item) => item.id === id) || PLATFORMS[0];
  }

  function getResolution(id) {
    return RESOLUTIONS.find((item) => item.id === id) || RESOLUTIONS[0];
  }

  function getCaptionMode(id) {
    return CAPTION_MODES.find((item) => item.id === id) || CAPTION_MODES[0];
  }

  function safeText(value, fallback) {
    const text = typeof value === "string" ? value.trim() : "";
    return text || fallback;
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function applyReviewReplacements(value, replacements) {
    let next = safeText(value, "");
    if (!next) {
      return next;
    }
    (replacements || []).forEach((entry) => {
      if (!entry || !entry.from || !entry.to) {
        return;
      }
      const pattern = new RegExp(escapeRegExp(entry.from), "gi");
      next = next.replace(pattern, entry.to);
    });
    return next;
  }

  function transcriptReviewReplacements(review) {
    if (!review || !review.approved || !Array.isArray(review.speakers)) {
      return [];
    }
    const pairs = [];
    review.speakers.forEach((speaker) => {
      if (speaker.speakerNameCorrected && speaker.speakerNameCorrected !== speaker.speakerName) {
        pairs.push({ from: speaker.speakerName, to: speaker.speakerNameCorrected });
      }
      if (speaker.brandCorrected && speaker.brandCorrected !== speaker.brand) {
        pairs.push({ from: speaker.brand, to: speaker.brandCorrected });
      }
      const topics = Array.isArray(speaker.topics) ? speaker.topics : [];
      const correctedTopics = Array.isArray(speaker.topicsCorrected) ? speaker.topicsCorrected : [];
      const max = Math.max(topics.length, correctedTopics.length);
      for (let index = 0; index < max; index += 1) {
        const from = safeText(topics[index], "");
        const to = safeText(correctedTopics[index], "");
        if (from && to && from !== to) {
          pairs.push({ from, to });
        }
      }
    });
    return pairs;
  }

  function applyTranscriptReviewLine(review, text) {
    return applyReviewReplacements(text, transcriptReviewReplacements(review));
  }

  function defaultDescription(episode) {
    return `${safeText(episode.episodeName, "The episode")} was prepared with a publish-ready long-form package.`;
  }

  function defaultChapters(episode) {
    const speakerCount = (episode.speakers || []).length;
    const extra = Math.min(Math.max(speakerCount, 1), 2);
    const items = [
      { time: "0:00", title: safeText(episode.episodeName, "Episode") + " · Opening" },
    ];
    for (let index = 0; index < extra; index++) {
      items.push({
        time: `${index + 1}:00`,
        title: `Segment ${index + 2}`,
      });
    }
    return items;
  }

  function defaultCredits(episode) {
    const speakers = Array.isArray(episode.speakers) ? episode.speakers : [];
    if (!speakers.length) {
      return "";
    }
    return speakers.map((speaker) => `${speaker.name || "Speaker"} — ${speaker.role || "Guest"}`).join("\n");
  }

  function buildPublishPackage(episodeSummary, context) {
    const episode = episodeSummary || {};
    const kitLine = (context && context.brandKitSummary && context.brandKitSummary.reviewLine) || "";
    const thumbs = PACKAGE_THUMBNAILS.map((item) => ({
      id: item.id,
      label: item.label,
      summary: `${item.summary}${kitLine ? ` (${kitLine})` : ""}`,
    }));
    return {
      episodeName: safeText(episode.episodeName, ""),
      title: safeText(episode.episodeName, "Episode publish package"),
      description: defaultDescription(episode),
      chapters: defaultChapters(episode),
      credits: defaultCredits(episode),
      thumbnails: thumbs,
      selectedThumbnailId: thumbs[0] ? thumbs[0].id : "",
    };
  }

  function validatePublishPackage(pkg) {
    const packageState = pkg || {};
    if (!safeText(packageState.title, "")) {
      return { ok: false, error: "Add a publish package title before exporting." };
    }
    if (!safeText(packageState.description, "")) {
      return { ok: false, error: "Add a publish package description before exporting." };
    }
    if (!Array.isArray(packageState.chapters) || packageState.chapters.length === 0) {
      return { ok: false, error: "Add at least one chapter marker before exporting." };
    }
    if (!Array.isArray(packageState.thumbnails) || packageState.thumbnails.length < 3) {
      return { ok: false, error: "Publish package requires at least three thumbnail options." };
    }
    if (!packageState.selectedThumbnailId) {
      return { ok: false, error: "Select a thumbnail option before exporting." };
    }
    return { ok: true };
  }

  function updateChapterTime(chapterId, value) {
    return {
      chapterId: safeText(chapterId, ""),
      time: safeText(value, "0:00"),
    };
  }

  function updateChapterTitle(chapterId, value) {
    return {
      chapterId: safeText(chapterId, ""),
      title: safeText(value, "Chapter"),
    };
  }

  function normalizePublishPackage(pkg) {
    const base = clone(pkg || buildPublishPackage({}, {}));
    if (!Array.isArray(base.thumbnails) || base.thumbnails.length === 0) {
      base.thumbnails = PACKAGE_THUMBNAILS.map((item) => ({ id: item.id, label: item.label, summary: item.summary }));
    }
    if (!base.thumbnails.find((item) => item.id === base.selectedThumbnailId)) {
      base.selectedThumbnailId = base.thumbnails[0] ? base.thumbnails[0].id : "";
    }
    return base;
  }

  function updatePublishPackage(state, key, value) {
    const next = normalizePublishPackage(state);
    if (key === "title") {
      next.title = safeText(value, next.title);
      return next;
    }
    if (key === "description") {
      next.description = safeText(value, next.description);
      return next;
    }
    if (key === "credits") {
      next.credits = safeText(value, next.credits);
      return next;
    }
    if (key === "selectedThumbnailId") {
      next.selectedThumbnailId = String(value || "");
      return next;
    }
    if (key === "chapter-time") {
      const chapter = updateChapterTime(value.chapterId, value.time);
      next.chapters = (next.chapters || []).map((item, index) => {
        if (String(index) === chapter.chapterId || String(item.id) === chapter.chapterId) {
          return Object.assign({}, item, { time: chapter.time });
        }
        return item;
      });
      return next;
    }
    if (key === "chapter-title") {
      const chapter = updateChapterTitle(value.chapterId, value.title);
      next.chapters = (next.chapters || []).map((item, index) => {
        if (String(index) === chapter.chapterId || String(item.id) === chapter.chapterId) {
          return Object.assign({}, item, { title: chapter.title });
        }
        return item;
      });
      return next;
    }
    return next;
  }

  function createExport(episodeSummary, options) {
    const episode = episodeSummary || {};
    const opts = options || {};
    return {
      episodeName: episode.episodeName || "",
      platform: "youtube",
      resolution: "1080p",
      captionMode: "burn-in",
      templateId: opts.templateId || "",
      templateName: opts.templateName || "",
      status: "draft",
      progress: 0,
      downloadName: "",
      startedAt: null,
      completedAt: null,
    };
  }

  function missingMessage(missing) {
    const needs = [];
    if (missing.indexOf("audio") >= 0) {
      needs.push("polish your audio");
    }
    if (missing.indexOf("style") >= 0) {
      needs.push("choose a visual style");
    }
    if (!needs.length) {
      return "";
    }
    if (needs.length === 1) {
      return `Please ${needs[0]} before exporting.`;
    }
    return `Please ${needs[0]} and ${needs[1]} before exporting.`;
  }

  function validateReadiness(context) {
    const ctx = context || {};
    const missing = [];
    if (!ctx.audioPolish || !ctx.audioPolish.presetName) {
      missing.push("audio");
    }
    if (!ctx.appliedStyle || !ctx.appliedStyle.presetName) {
      missing.push("style");
    }
    if (missing.length) {
      return { ok: false, error: missingMessage(missing), missing };
    }
    return { ok: true };
  }

  function updateOption(state, key, value) {
    const next = clone(state || createExport({}));
    if (key === "platform" && getPlatform(value).id === value) {
      next.platform = value;
    } else if (key === "resolution" && getResolution(value).id === value) {
      next.resolution = value;
    } else if (key === "captionMode" && getCaptionMode(value).id === value) {
      next.captionMode = value;
    } else if (key === "templateId") {
      next.templateId = typeof value === "string" ? value : "";
    } else if (key === "templateName") {
      next.templateName = typeof value === "string" ? value : "";
    }
    return next;
  }

  function buildFinalSummary(episodeSummary, context, exportState) {
    const episode = episodeSummary || {};
    const ctx = context || {};
    const job = exportState || {};
    const pkg = ctx.package || ctx.publishPackage || null;
    const transcriptReview = ctx.transcriptReview || null;
    const lines = [];

    lines.push(`${episode.speakerCount || 0} speaker${episode.speakerCount === 1 ? "" : "s"} · ${episode.sourceModeLabel || "sources"}`);

    if (ctx.audioPolish && ctx.audioPolish.presetName) {
      lines.push(`Audio: ${ctx.audioPolish.presetName} (${ctx.audioPolish.treatmentLine || "treatment applied"})`);
    }
    if (ctx.appliedStyle && ctx.appliedStyle.presetName) {
      lines.push(
        `Visual style: ${ctx.appliedStyle.presetName} · ${ctx.appliedStyle.layoutLabel || "layout"} · ${ctx.appliedStyle.pacingLabel || "pacing"}`,
      );
    }
    const templateName = job.templateName || ctx.templateName || "";
    if (templateName) {
      lines.push(`Show template: ${templateName}`);
    }
    if (ctx.momentsSummary && ctx.momentsSummary.reviewLine) {
      lines.push(ctx.momentsSummary.reviewLine);
    }
    if (ctx.contextSummary && ctx.contextSummary.reviewLine) {
      lines.push(ctx.contextSummary.reviewLine);
    }
    if (ctx.brandKitSummary && ctx.brandKitSummary.reviewLine) {
      lines.push(ctx.brandKitSummary.reviewLine);
    }
    if (pkg && pkg.title) {
      const packageTitle = transcriptReview && transcriptReview.approved ? applyTranscriptReviewLine(transcriptReview, pkg.title) : pkg.title;
      lines.push(`Publish package: ${packageTitle}`);
    }
    if (pkg && pkg.description) {
      const description = transcriptReview && transcriptReview.approved
        ? applyTranscriptReviewLine(transcriptReview, pkg.description)
        : pkg.description;
      lines.push(`Package description: ${description}`);
    }
    if (pkg && Array.isArray(pkg.chapters) && pkg.chapters.length) {
      lines.push(`Publish chapters: ${pkg.chapters.length}`);
    }
    if (pkg && pkg.credits) {
      const credits = transcriptReview && transcriptReview.approved
        ? applyTranscriptReviewLine(transcriptReview, pkg.credits)
        : pkg.credits;
      lines.push(`Speaker credits: ${credits}`);
    }
    if (pkg && pkg.selectedThumbnailId) {
      const selected = (pkg.thumbnails || []).find((item) => item.id === pkg.selectedThumbnailId);
      lines.push(`Thumbnail selected: ${selected ? selected.label : pkg.selectedThumbnailId}`);
    }

    const platform = getPlatform(job.platform);
    const resolution = getResolution(job.resolution);
    const captions = getCaptionMode(job.captionMode);
    lines.push(`Export: ${platform.name} · ${resolution.label} · ${captions.label}`);

    return {
      episodeName: episode.episodeName || "",
      lines,
      platformName: platform.name,
      resolutionLabel: resolution.label,
      captionLabel: captions.label,
    };
  }

  function safeFileStem(name) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    const stem = trimmed.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    return stem || "episode";
  }

  function startExport(state, episodeSummary, context) {
    const check = validateReadiness(context);
    if (!check.ok) {
      return { ok: false, error: check.error, state: clone(state || createExport(episodeSummary)) };
    }
    const next = clone(state || createExport(episodeSummary));
    next.status = "rendering";
    next.progress = 0;
    next.startedAt = Date.now();
    next.completedAt = null;
    next.downloadName = "";
    return { ok: true, state: next };
  }

  function completeExport(state, episodeSummary) {
    const next = clone(state || createExport(episodeSummary));
    const episode = episodeSummary || {};
    next.status = "ready";
    next.progress = 100;
    next.completedAt = Date.now();
    next.downloadName = `${safeFileStem(episode.episodeName)}-${next.resolution}.mp4`;
    return next;
  }

  function runExport(state, episodeSummary, context) {
    const started = startExport(state, episodeSummary, context);
    if (!started.ok) {
      return started;
    }
    return { ok: true, state: completeExport(started.state, episodeSummary) };
  }

  function summarizeExport(state) {
    const job = state || {};
    const platform = getPlatform(job.platform);
    const resolution = getResolution(job.resolution);
    const captions = getCaptionMode(job.captionMode);
    return {
      status: job.status || "draft",
      progress: job.progress || 0,
      platformName: platform.name,
      resolutionLabel: resolution.label,
      captionLabel: captions.label,
      templateName: job.templateName || "",
      downloadName: job.downloadName || "",
      ready: job.status === "ready",
      rendering: job.status === "rendering",
    };
  }

  const api = {
    PLATFORMS,
    RESOLUTIONS,
    CAPTION_MODES,
    getPlatform,
    getResolution,
    getCaptionMode,
    createExport,
    buildPublishPackage,
    validatePublishPackage,
    updatePublishPackage,
    validateReadiness,
    updateOption,
    buildFinalSummary,
    startExport,
    completeExport,
    runExport,
    summarizeExport,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcEpisodeExport = api;
}(typeof window !== "undefined" ? window : globalThis));

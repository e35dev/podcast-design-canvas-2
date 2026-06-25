"use strict";

// Show library for Podcast Design Canvas (#47).
//
// Groups episodes under named show identities with saved template/style defaults so
// creators can browse past work and start new episodes prefilled from a show.
// DOM-free — persistence is handled by the UI layer (localStorage).
(function (global) {
  let showCounter = 0;
  let episodeCounter = 0;

  const EPISODE_STATUS = {
    DRAFT: "draft",
    IN_PROGRESS: "in_progress",
    IN_REVIEW: "in_review",
    EXPORTED: "exported",
  };

  const STATUS_LABELS = {
    draft: "Not started",
    in_progress: "In production",
    in_review: "Ready to review",
    exported: "Exported",
  };

  function templatesApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./show-templates.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcShowTemplates;
  }

  function styleApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./episode-style.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcEpisodeStyle;
  }

  function createLibrary() {
    return { shows: [], episodes: [] };
  }

  function normalizeName(name) {
    return typeof name === "string" ? name.trim() : "";
  }

  function validateShowName(library, name, excludeId) {
    const trimmed = normalizeName(name);
    if (!trimmed) {
      return { ok: false, error: "Give your show a name." };
    }
    const list = library && Array.isArray(library.shows) ? library.shows : [];
    const duplicate = list.find(
      (show) => show.name.toLowerCase() === trimmed.toLowerCase() && show.id !== excludeId,
    );
    if (duplicate) {
      return { ok: false, error: "A show with that name already exists." };
    }
    return { ok: true, name: trimmed };
  }

  function createShow(name, options) {
    const opts = options || {};
    showCounter += 1;
    return {
      id: opts.id || `show-${showCounter}`,
      name: normalizeName(name),
      createdAt: Date.now(),
      templateId: opts.templateId || null,
      styleDefaults: opts.styleDefaults ? Object.assign({}, opts.styleDefaults) : null,
    };
  }

  function saveShow(library, show) {
    const next = createLibrary();
    const existingShows = library && Array.isArray(library.shows) ? library.shows : [];
    const existingEpisodes = library && Array.isArray(library.episodes) ? library.episodes : [];
    next.shows = existingShows.slice();
    next.episodes = existingEpisodes.slice();
    const index = next.shows.findIndex((item) => item.id === show.id);
    const saved = Object.assign({}, show, {
      styleDefaults: show.styleDefaults ? Object.assign({}, show.styleDefaults) : null,
    });
    if (index >= 0) {
      next.shows[index] = saved;
    } else {
      next.shows.push(saved);
    }
    next.shows.sort((a, b) => a.name.localeCompare(b.name));
    return next;
  }

  function listShows(library) {
    const list = library && Array.isArray(library.shows) ? library.shows : [];
    return list.map((show) => ({
      id: show.id,
      name: show.name,
      createdAt: show.createdAt,
      templateId: show.templateId,
    }));
  }

  function getShow(library, id) {
    const list = library && Array.isArray(library.shows) ? library.shows : [];
    const found = list.find((show) => show.id === id);
    if (!found) {
      return null;
    }
    return Object.assign({}, found, {
      styleDefaults: found.styleDefaults ? Object.assign({}, found.styleDefaults) : null,
    });
  }

  function createEpisode(showId, episodeName, options) {
    const opts = options || {};
    episodeCounter += 1;
    return {
      id: opts.id || `ep-${episodeCounter}`,
      showId: showId,
      name: normalizeName(episodeName) || "Untitled episode",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: EPISODE_STATUS.DRAFT,
      statusLabel: STATUS_LABELS.draft,
      progressLine: "Not started",
      workspaceCompleteCount: 0,
    };
  }

  function deriveEpisodeStatus(workspace) {
    if (!workspace || !Array.isArray(workspace.stages)) {
      return {
        status: EPISODE_STATUS.DRAFT,
        statusLabel: STATUS_LABELS.draft,
        progressLine: "Not started",
        workspaceCompleteCount: 0,
      };
    }

    const exportStage = workspace.stages.find((item) => item.id === "export");
    const reviewStage = workspace.stages.find((item) => item.id === "review");
    const completeCount = workspace.completeCount || 0;
    const progressLine = workspace.progressLine || `${completeCount} of ${workspace.totalStages || 7} stages complete`;

    if (exportStage && exportStage.status === "complete") {
      return {
        status: EPISODE_STATUS.EXPORTED,
        statusLabel: STATUS_LABELS.exported,
        progressLine: progressLine,
        workspaceCompleteCount: completeCount,
      };
    }
    if (reviewStage && reviewStage.status === "complete") {
      return {
        status: EPISODE_STATUS.IN_REVIEW,
        statusLabel: STATUS_LABELS.in_review,
        progressLine: progressLine,
        workspaceCompleteCount: completeCount,
      };
    }
    if (completeCount > 0) {
      return {
        status: EPISODE_STATUS.IN_PROGRESS,
        statusLabel: STATUS_LABELS.in_progress,
        progressLine: progressLine,
        workspaceCompleteCount: completeCount,
      };
    }
    return {
      status: EPISODE_STATUS.DRAFT,
      statusLabel: STATUS_LABELS.draft,
      progressLine: "Not started",
      workspaceCompleteCount: 0,
    };
  }

  function updateEpisodeProgress(episode, workspace) {
    const derived = deriveEpisodeStatus(workspace);
    return Object.assign({}, episode, {
      status: derived.status,
      statusLabel: derived.statusLabel,
      progressLine: derived.progressLine,
      workspaceCompleteCount: derived.workspaceCompleteCount,
      updatedAt: Date.now(),
    });
  }

  function saveEpisode(library, episode) {
    const next = createLibrary();
    const existingShows = library && Array.isArray(library.shows) ? library.shows : [];
    const existingEpisodes = library && Array.isArray(library.episodes) ? library.episodes : [];
    next.shows = existingShows.slice();
    next.episodes = existingEpisodes.slice();
    const index = next.episodes.findIndex((item) => item.id === episode.id);
    if (index >= 0) {
      next.episodes[index] = Object.assign({}, episode);
    } else {
      next.episodes.push(Object.assign({}, episode));
    }
    return next;
  }

  function getEpisode(library, episodeId) {
    const list = library && Array.isArray(library.episodes) ? library.episodes : [];
    const found = list.find((episode) => episode.id === episodeId);
    return found ? Object.assign({}, found) : null;
  }

  function listEpisodesForShow(library, showId) {
    const list = library && Array.isArray(library.episodes) ? library.episodes : [];
    return list
      .filter((episode) => episode.showId === showId)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .map((episode) => ({
        id: episode.id,
        showId: episode.showId,
        name: episode.name,
        status: episode.status,
        statusLabel: episode.statusLabel || STATUS_LABELS[episode.status] || STATUS_LABELS.draft,
        progressLine: episode.progressLine || "",
        workspaceCompleteCount: episode.workspaceCompleteCount || 0,
        updatedAt: episode.updatedAt,
      }));
  }

  function buildIdentityLine(show, template) {
    const parts = [];
    if (template && template.canvas) {
      if (template.canvas.presetName) {
        parts.push(template.canvas.presetName);
      }
      if (template.canvas.titleText) {
        parts.push(template.canvas.titleText);
      }
    } else if (show && show.styleDefaults) {
      const STY = styleApi();
      if (STY && show.styleDefaults.presetId) {
        const preset = STY.getPreset(show.styleDefaults.presetId);
        if (preset) {
          parts.push(preset.label);
        }
      }
      if (show.styleDefaults.layout && show.styleDefaults.layout !== "auto") {
        parts.push(`${show.styleDefaults.layout} layout`);
      }
    }
    return parts.length ? parts.join(" · ") : "Set a visual identity when you save a template";
  }

  function buildShowSummary(library, show, templateStore) {
    const TM = templatesApi();
    const template = show.templateId && TM
      ? TM.getTemplate(templateStore, show.templateId)
      : null;
    const episodes = listEpisodesForShow(library, show.id);
    return {
      id: show.id,
      name: show.name,
      templateId: show.templateId,
      templateName: template ? template.name : "",
      identityLine: buildIdentityLine(show, template),
      episodeCount: episodes.length,
      episodes: episodes,
    };
  }

  function createShowFromTemplate(library, templateStore, templateId, showName) {
    const TM = templatesApi();
    const nameCheck = validateShowName(library, showName);
    if (!nameCheck.ok) {
      return { ok: false, error: nameCheck.error };
    }
    const template = TM ? TM.getTemplate(templateStore, templateId) : null;
    if (!template) {
      return { ok: false, error: "Pick a saved show template to attach to this show." };
    }
    const styleDefaults = TM.styleSelectionFromCanvas(template.canvas);
    const show = createShow(nameCheck.name, {
      templateId: templateId,
      styleDefaults: styleDefaults,
    });
    return { ok: true, show: show, library: saveShow(library, show) };
  }

  function buildPrefillFromShow(show, templateStore) {
    const TM = templatesApi();
    const result = {
      templateId: null,
      styleSelection: null,
    };
    if (!show) {
      return result;
    }
    if (show.templateId && TM) {
      const template = TM.getTemplate(templateStore, show.templateId);
      if (template) {
        result.templateId = show.templateId;
        result.styleSelection = TM.styleSelectionFromCanvas(template.canvas);
        return result;
      }
    }
    if (show.styleDefaults) {
      result.styleSelection = Object.assign({}, show.styleDefaults);
    }
    return result;
  }

  function applyPrefillToEpisodeState(prefill, episodeSummary, templateStore) {
    const TM = templatesApi();
    const CE = typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./canvas-editor.js")
      : (typeof window !== "undefined" ? window.PdcCanvasEditor : null);
    const out = {
      styleSelection: prefill.styleSelection,
      activeTemplateId: prefill.templateId || null,
      canvasDoc: null,
      appliedStyle: null,
    };
    if (!prefill.templateId || !TM) {
      return out;
    }
    const template = TM.getTemplate(templateStore, prefill.templateId);
    if (!template || !episodeSummary) {
      return out;
    }
    const selection = prefill.styleSelection || TM.styleSelectionFromCanvas(template.canvas);
    out.canvasDoc = TM.applyTemplateForEpisode(template, episodeSummary, selection);
    if (CE && out.canvasDoc && selection) {
      out.appliedStyle = null;
    }
    return out;
  }

  function serializeLibrary(library) {
    return JSON.stringify(library || createLibrary());
  }

  function deserializeLibrary(json) {
    if (!json) {
      return createLibrary();
    }
    try {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.shows) || !Array.isArray(parsed.episodes)) {
        return createLibrary();
      }
      return { shows: parsed.shows, episodes: parsed.episodes };
    } catch (err) {
      return createLibrary();
    }
  }

  function _resetCounters() {
    showCounter = 0;
    episodeCounter = 0;
  }

  const api = {
    EPISODE_STATUS,
    STATUS_LABELS,
    createLibrary,
    validateShowName,
    createShow,
    saveShow,
    listShows,
    getShow,
    createEpisode,
    deriveEpisodeStatus,
    updateEpisodeProgress,
    saveEpisode,
    getEpisode,
    listEpisodesForShow,
    buildIdentityLine,
    buildShowSummary,
    createShowFromTemplate,
    buildPrefillFromShow,
    applyPrefillToEpisodeState,
    serializeLibrary,
    deserializeLibrary,
    _resetCounters,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcShowLibrary = api;
}(typeof window !== "undefined" ? window : globalThis));

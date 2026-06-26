"use strict";

// Named show template store for Podcast Design Canvas (#11).
//
// Saves customized canvas documents as reusable show templates creators can pick on
// future episodes. DOM-free — persistence is handled by the UI layer (localStorage).
(function (global) {
  let templateCounter = 0;

  function styleApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./episode-style.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcEpisodeStyle;
  }

  function editorApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./canvas-editor.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcCanvasEditor;
  }

  function createStore() {
    return { templates: [] };
  }

  function cloneCanvas(canvas) {
    return JSON.parse(JSON.stringify(canvas));
  }

  function normalizeName(name) {
    return typeof name === "string" ? name.trim() : "";
  }

  function validateTemplateName(store, name, excludeId, showId) {
    const trimmed = normalizeName(name);
    if (!trimmed) {
      return { ok: false, error: "Give your show template a name." };
    }
    const scopeShowId = normalizeName(showId);
    const list = store && Array.isArray(store.templates) ? store.templates : [];
    const duplicate = list.find(
      (template) => template.name.toLowerCase() === trimmed.toLowerCase()
        && template.id !== excludeId
        && normalizeName(template.showId) === scopeShowId,
    );
    if (duplicate) {
      return { ok: false, error: "A template with that name already exists." };
    }
    return { ok: true, name: trimmed };
  }

  function createTemplate(name, canvasDoc, id, showId) {
    templateCounter += 1;
    return {
      id: id || `tpl-${templateCounter}`,
      showId: normalizeName(showId),
      name: normalizeName(name),
      createdAt: Date.now(),
      canvas: cloneCanvas(canvasDoc),
    };
  }

  function saveTemplate(store, template) {
    const next = createStore();
    const existing = store && Array.isArray(store.templates) ? store.templates : [];
    next.templates = existing.slice();
    const index = next.templates.findIndex((item) => item.id === template.id);
    if (index >= 0) {
      next.templates[index] = Object.assign({}, template, { canvas: cloneCanvas(template.canvas) });
    } else {
      next.templates.push(
        Object.assign({}, template, { canvas: cloneCanvas(template.canvas) }),
      );
    }
    next.templates.sort((a, b) => a.name.localeCompare(b.name));
    return next;
  }

  function listTemplates(store) {
    const list = store && Array.isArray(store.templates) ? store.templates : [];
    return list.map((template) => ({
      id: template.id,
      showId: normalizeName(template.showId),
      name: template.name,
      createdAt: template.createdAt,
      presetName: template.canvas && template.canvas.presetName,
      titleText: template.canvas && template.canvas.titleText,
    }));
  }

  function listTemplatesForShow(store, showId) {
    const scopeShowId = normalizeName(showId);
    if (!scopeShowId) {
      return [];
    }
    return listTemplates(store).filter((template) => template.showId === scopeShowId);
  }

  function reconcileTemplateShowIds(store, library) {
    const shows = library && Array.isArray(library.shows) ? library.shows : [];
    const next = createStore();
    next.templates = (store && Array.isArray(store.templates) ? store.templates : []).map(function (template) {
      if (normalizeName(template.showId)) {
        return template;
      }
      const owner = shows.find(function (show) {
        return show.templateId === template.id;
      });
      if (owner) {
        return Object.assign({}, template, { showId: owner.id });
      }
      return template;
    });
    syncCountersFromStore(next);
    return next;
  }

  function getTemplate(store, id) {
    const list = store && Array.isArray(store.templates) ? store.templates : [];
    const found = list.find((template) => template.id === id);
    if (!found) {
      return null;
    }
    return Object.assign({}, found, {
      showId: normalizeName(found.showId),
      canvas: cloneCanvas(found.canvas),
    });
  }

  function applyTemplate(template) {
    if (!template || !template.canvas) {
      return null;
    }
    return cloneCanvas(template.canvas);
  }

  // Apply a saved template to a new episode — layout and style settings carry over,
  // speaker frames rebuild from the current episode's assigned speakers.
  function applyTemplateForEpisode(template, episodeSummary, styleSelection) {
    const canvas = applyTemplate(template);
    if (!canvas) {
      return null;
    }
    const CE = editorApi();
    const STY = styleApi();
    const episode = episodeSummary || {};
    const selection = styleSelection || {};
    if (CE && typeof CE.refreshSpeakerFrames === "function") {
      return CE.refreshSpeakerFrames(canvas, episode, selection);
    }
    if (STY) {
      canvas.speakerFrames = STY.buildPreviewFrames(
        episode.speakers,
        selection,
        episode.speakerCount,
      );
    }
    return canvas;
  }

  function styleSelectionFromCanvas(canvas) {
    const STY = styleApi();
    if (!STY || !canvas) {
      return null;
    }
    const selection = STY.createSelection();
    selection.presetId = canvas.presetId || selection.presetId;
    selection.layout = canvas.layoutId || selection.layout;
    selection.pacing = canvas.pacingId || selection.pacing;
    return selection;
  }

  function serializeStore(store) {
    return JSON.stringify(store || createStore());
  }

  function syncCountersFromStore(store) {
    const list = store && Array.isArray(store.templates) ? store.templates : [];
    list.forEach(function (template) {
      const match = /^tpl-(\d+)$/.exec(template.id || "");
      if (match) {
        templateCounter = Math.max(templateCounter, Number(match[1]));
      }
    });
  }

  function normalizeStoredTemplates(templates) {
    return (Array.isArray(templates) ? templates : []).map(function (template) {
      return Object.assign({}, template, { showId: normalizeName(template.showId) });
    });
  }

  function deserializeStore(json) {
    if (!json) {
      return createStore();
    }
    try {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.templates)) {
        return createStore();
      }
      const store = { templates: normalizeStoredTemplates(parsed.templates) };
      syncCountersFromStore(store);
      return store;
    } catch (err) {
      return createStore();
    }
  }

  function hydrateTemplateStore(json, library) {
    let store = deserializeStore(json);
    if (library) {
      store = reconcileTemplateShowIds(store, library);
    }
    return store;
  }

  function _resetTemplateCounter() {
    templateCounter = 0;
  }

  const api = {
    createStore,
    validateTemplateName,
    createTemplate,
    saveTemplate,
    listTemplates,
    listTemplatesForShow,
    reconcileTemplateShowIds,
    getTemplate,
    applyTemplate,
    applyTemplateForEpisode,
    styleSelectionFromCanvas,
    serializeStore,
    deserializeStore,
    hydrateTemplateStore,
    _resetTemplateCounter,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcShowTemplates = api;
}(typeof window !== "undefined" ? window : globalThis));

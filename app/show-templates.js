"use strict";

// Named show template store for Podcast Design Canvas (#11).
//
// Saves customized canvas documents as reusable show templates creators can pick on
// future episodes. DOM-free — persistence is handled by the UI layer (localStorage).
(function (global) {
  let templateCounter = 0;

  function createStore() {
    return { templates: [] };
  }

  function cloneCanvas(canvas) {
    return JSON.parse(JSON.stringify(canvas));
  }

  function normalizeName(name) {
    return typeof name === "string" ? name.trim() : "";
  }

  function validateTemplateName(store, name, excludeId) {
    const trimmed = normalizeName(name);
    if (!trimmed) {
      return { ok: false, error: "Give your show template a name." };
    }
    const list = store && Array.isArray(store.templates) ? store.templates : [];
    const duplicate = list.find(
      (template) => template.name.toLowerCase() === trimmed.toLowerCase() && template.id !== excludeId,
    );
    if (duplicate) {
      return { ok: false, error: "A template with that name already exists." };
    }
    return { ok: true, name: trimmed };
  }

  function createTemplate(name, canvasDoc, id) {
    templateCounter += 1;
    return {
      id: id || `tpl-${templateCounter}`,
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
      name: template.name,
      createdAt: template.createdAt,
      presetName: template.canvas && template.canvas.presetName,
      titleText: template.canvas && template.canvas.titleText,
    }));
  }

  function getTemplate(store, id) {
    const list = store && Array.isArray(store.templates) ? store.templates : [];
    const found = list.find((template) => template.id === id);
    if (!found) {
      return null;
    }
    return Object.assign({}, found, { canvas: cloneCanvas(found.canvas) });
  }

  function applyTemplate(template) {
    if (!template || !template.canvas) {
      return null;
    }
    return cloneCanvas(template.canvas);
  }

  // Look up the episode-style API in both Node (require) and the browser (global),
  // mirroring how canvas-editor.js resolves its dependencies.
  function styleApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./episode-style.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcEpisodeStyle;
  }

  // Apply a saved template to a *different* episode. The template's visual identity —
  // preset, layout, palette, layer stack, title and caption styling — is carried forward,
  // but the speaker frames are rebuilt from the current episode's assigned Host/Guest
  // buckets. This is the reuse promise in issue #27: one show look, many episodes, each
  // with its own speakers. Returns the adapted canvas, or null for a missing template.
  function applyTemplateToEpisode(template, episodeSummary, styleSelection) {
    const canvas = applyTemplate(template);
    if (!canvas) {
      return null;
    }
    const episode = episodeSummary || {};
    if (!Array.isArray(episode.speakers)) {
      return canvas;
    }
    const STY = styleApi();
    if (STY && typeof STY.buildPreviewFrames === "function") {
      // Build frames against the template's saved layout so the show identity holds,
      // while the names/roles/count come from the current episode.
      const selection = styleSelection || { layout: canvas.layoutId };
      canvas.speakerFrames = STY.buildPreviewFrames(
        episode.speakers,
        Object.assign({}, selection, { layout: canvas.layoutId || selection.layout }),
        episode.speakerCount,
      );
    } else {
      // No style helper available — fall back to a minimal rebind so speaker names still
      // reflect the current episode rather than the template's original cast.
      canvas.speakerFrames = episode.speakers.map((speaker) => ({
        role: (speaker && speaker.role) || "Speaker",
        name: (speaker && speaker.name) || "Unnamed speaker",
        active: false,
        layout: canvas.layoutId,
      }));
    }
    return canvas;
  }

  function serializeStore(store) {
    return JSON.stringify(store || createStore());
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
      return { templates: parsed.templates };
    } catch (err) {
      return createStore();
    }
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
    getTemplate,
    applyTemplate,
    applyTemplateToEpisode,
    serializeStore,
    deserializeStore,
    _resetTemplateCounter,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcShowTemplates = api;
}(typeof window !== "undefined" ? window : globalThis));

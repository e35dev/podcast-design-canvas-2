"use strict";

// Canvas editor model for Podcast Design Canvas (#11).
//
// DOM-free: manages show templates — named, reusable layout customizations built on top of
// a chosen style preset. The five editable element types cover every visible layer a
// creator might want to personalise before exporting. No build, no dependencies.
(function (global) {
  // The five customisable layout element types present in every canvas template.
  const ELEMENT_TYPES = [
    { id: "speaker-frame", label: "Speaker frames", props: ["borderRadius", "borderColor", "frameSize"] },
    { id: "caption-bar",   label: "Captions",       props: ["fontSize", "bgOpacity", "position"] },
    { id: "title-text",    label: "Title text",     props: ["content", "fontSize", "color"] },
    { id: "background",    label: "Background",     props: ["color"] },
    { id: "overlay",       label: "Overlay",        props: ["color", "opacity"] },
  ];

  // Create a blank template from a style selection. All element customisations start empty
  // so the preset defaults remain visible until the creator explicitly overrides them.
  function createTemplate(name, styleSelection) {
    return {
      name: typeof name === "string" ? name.trim() : "",
      presetId: (styleSelection && styleSelection.presetId) || null,
      layout: (styleSelection && styleSelection.layout) || "auto",
      pacing: (styleSelection && styleSelection.pacing) || "balanced",
      elements: ELEMENT_TYPES.map((type) => ({
        id: type.id,
        label: type.label,
        customizations: {},
      })),
      savedAt: null,
    };
  }

  // Apply changes to one element's customisations. Returns { ok } or { ok, error }.
  // Merges into existing customisations so callers can update individual props incrementally.
  function updateElement(template, elementId, changes) {
    if (!template || !Array.isArray(template.elements)) {
      return { ok: false, error: "Invalid template." };
    }
    const element = template.elements.find((e) => e.id === elementId);
    if (!element) {
      return {
        ok: false,
        error: `Unknown element: "${elementId}". Valid ids: ${ELEMENT_TYPES.map((t) => t.id).join(", ")}.`,
      };
    }
    Object.assign(element.customizations, changes);
    return { ok: true };
  }

  // Validate a template before saving. Distinct from createTemplate so callers control
  // when errors surface — matching the validateDraft / validateStyleSelection pattern.
  function validateTemplate(template) {
    if (!template || typeof template !== "object") {
      return { ok: false, error: "Template is required." };
    }
    if (!template.name || !template.name.trim()) {
      return { ok: false, error: "Template name is required." };
    }
    if (!template.presetId) {
      return { ok: false, error: "Template must be based on a style preset." };
    }
    if (!Array.isArray(template.elements) || template.elements.length === 0) {
      return { ok: false, error: "Template must have at least one layout element." };
    }
    return { ok: true };
  }

  // Monotonically increasing counter so same-millisecond saves retain insertion order.
  let _saveSeq = 0;

  // Persist a validated template in the provided store (a plain object keyed by name).
  // The store is injected so the same function works in Node tests and in the browser
  // (where the caller can back it with localStorage or sessionStorage).
  function saveTemplate(store, template) {
    const check = validateTemplate(template);
    if (!check.ok) {
      return check;
    }
    const copy = JSON.parse(JSON.stringify(template));
    copy.savedAt = Date.now();
    copy.saveSeq = ++_saveSeq;
    store[copy.name] = copy;
    return { ok: true, name: copy.name };
  }

  // Return all saved templates sorted most-recently-saved first.
  // saveSeq breaks ties when two saves share the same millisecond.
  function listTemplates(store) {
    return Object.values(store).sort((a, b) => {
      const byTime = (b.savedAt || 0) - (a.savedAt || 0);
      return byTime !== 0 ? byTime : (b.saveSeq || 0) - (a.saveSeq || 0);
    });
  }

  // Look up a saved template by name; returns null when not found.
  function getTemplate(store, name) {
    return (store && name && store[name]) ? store[name] : null;
  }

  const api = {
    ELEMENT_TYPES,
    createTemplate,
    updateElement,
    validateTemplate,
    saveTemplate,
    listTemplates,
    getTemplate,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcCanvasEditor = api;
}(typeof window !== "undefined" ? window : globalThis));

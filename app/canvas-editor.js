"use strict";

// Reusable canvas editor model for Podcast Design Canvas (#11 — the canvas editor step).
//
// This is the single source of truth for turning a chosen preset style into a personal,
// reusable show layout. It is the step after preset choice: open the preset as a starting
// point, adjust the visible layout elements (speaker frames, captions, title text,
// background, and overlay areas), then save the result as a named show template that
// future episodes can reuse while still adapting to their own speakers.
//
// Deliberately DOM-free so the exact same rules run in the browser (the editor screen
// imports it as a global) and in node (the canvas-editor tests `require` it). No build
// step, no dependencies, no storage — the browser layer handles persistence.
(function (global) {
  // The layout elements a creator can adjust on the canvas, in back-to-front layer order.
  // The frame layers are generated per speaker; the rest are single editable elements.
  const ELEMENT_KINDS = [
    { key: "background", label: "Background", kind: "background" },
    { key: "frames", label: "Speaker frames", kind: "frame" },
    { key: "title", label: "Title text", kind: "title" },
    { key: "caption", label: "Captions", kind: "caption" },
    { key: "overlay", label: "Overlay area", kind: "overlay" },
  ];

  // The toggleable elements (everything except the always-present background/frames base).
  const TOGGLE_SECTIONS = ["title", "caption", "overlay"];

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  // A url-safe id for a template, derived from its display name so reusing the same name
  // updates the existing template rather than piling up duplicates.
  function slugify(name) {
    const base = trim(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || "template";
  }

  // The reusable visual identity, independent of any one episode's speaker names. Built
  // from a preset when first opening the editor, or restored from a saved template. Frames
  // are NOT part of the look — they are re-derived from each episode's real speakers so a
  // template keeps the same identity while adapting to whoever is on the new episode.
  function lookFromPreset(preset) {
    const p = preset && preset.id ? preset : {};
    return {
      presetId: p.id || "",
      presetName: p.name || "Custom",
      layout: p.defaultLayout || "spotlight",
      background: p.background || "#10131f",
      accent: p.accent || "#ffb347",
      textColor: p.textColor || "#f6f7fb",
      captionStyle: p.captionStyle || "Caption bar",
      title: { visible: true, text: "" },
      caption: { visible: true, style: p.captionStyle || "Caption bar" },
      overlay: { visible: false, label: "Logo / b-roll area" },
      hiddenRoles: [],
    };
  }

  // One frame layer per assigned speaker, in setup order. A frame whose role was hidden in
  // a saved template comes back hidden when that template is reused; everyone else shows.
  function buildFrames(speakers, hiddenRoles) {
    const list = Array.isArray(speakers) ? speakers : [];
    const hidden = new Set((hiddenRoles || []).map((role) => trim(role)));
    return list.map((raw, index) => {
      const speaker = raw && typeof raw === "object" ? raw : {};
      const role = trim(speaker.role) || `Speaker ${index + 1}`;
      return {
        role,
        name: trim(speaker.name) || "Unnamed speaker",
        visible: !hidden.has(role),
      };
    });
  }

  // Assemble a live, editable design from a reusable look plus this episode's speakers.
  function designFromLook(look, speakers) {
    return {
      presetId: look.presetId,
      presetName: look.presetName,
      layout: look.layout,
      background: look.background,
      accent: look.accent,
      textColor: look.textColor,
      captionStyle: look.captionStyle,
      title: { visible: Boolean(look.title.visible), text: look.title.text || "" },
      caption: { visible: Boolean(look.caption.visible), style: look.caption.style },
      overlay: { visible: Boolean(look.overlay.visible), label: look.overlay.label || "Overlay area" },
      frames: buildFrames(speakers, look.hiddenRoles),
    };
  }

  // Open the chosen preset as a starting canvas for the episode's real speakers. This is
  // the "open a canvas editor from that style" entry point.
  function createDesign(preset, speakers) {
    return designFromLook(lookFromPreset(preset), speakers);
  }

  // ---- Editing the live design ------------------------------------------------

  function setBackground(design, color) {
    design.background = trim(color) || design.background;
    return design;
  }

  function setAccent(design, color) {
    design.accent = trim(color) || design.accent;
    return design;
  }

  function setTitleText(design, text) {
    design.title.text = typeof text === "string" ? text : "";
    return design;
  }

  function setOverlayLabel(design, text) {
    const value = trim(text);
    design.overlay.label = value || "Overlay area";
    return design;
  }

  // Show/hide a whole element (title, caption, overlay). Unknown keys are ignored.
  function toggleSection(design, key) {
    if (TOGGLE_SECTIONS.indexOf(key) >= 0 && design[key]) {
      design[key].visible = !design[key].visible;
    }
    return design;
  }

  // Show/hide a single speaker frame by its index.
  function toggleFrame(design, index) {
    const frame = design.frames && design.frames[index];
    if (frame) {
      frame.visible = !frame.visible;
    }
    return design;
  }

  // The ordered layer list the editor renders, top-level first. Each entry is enough for
  // the panel to draw a row (label + on/off + the editable detail) and for tests to assert
  // a change landed.
  function elementList(design) {
    const items = [
      { key: "background", kind: "background", label: "Background", visible: true, detail: design.background },
    ];
    (design.frames || []).forEach((frame, index) => {
      items.push({
        key: `frame:${index}`,
        kind: "frame",
        label: `${frame.role} — ${frame.name}`,
        visible: frame.visible,
        detail: frame.role,
      });
    });
    items.push({ key: "title", kind: "title", label: "Title text", visible: design.title.visible, detail: design.title.text });
    items.push({ key: "caption", kind: "caption", label: "Captions", visible: design.caption.visible, detail: design.caption.style });
    items.push({ key: "overlay", kind: "overlay", label: "Overlay area", visible: design.overlay.visible, detail: design.overlay.label });
    return items;
  }

  // What the workspace shows about a design once it is in hand — all derived, never faked.
  function summarizeDesign(design) {
    const frames = design.frames || [];
    const visibleFrames = frames.filter((frame) => frame.visible).length;
    return {
      presetName: design.presetName,
      layout: design.layout,
      background: design.background,
      accent: design.accent,
      captionStyle: design.caption.style,
      titleText: design.title.text,
      titleOn: design.title.visible,
      captionOn: design.caption.visible,
      overlayOn: design.overlay.visible,
      visibleFrames,
      totalFrames: frames.length,
      elementCount: elementList(design).length,
    };
  }

  // ---- Reusable show templates ------------------------------------------------

  function createTemplateStore() {
    return { templates: [] };
  }

  // A template name must be present so the creator can find and reuse it later.
  function validateTemplateName(name) {
    if (!trim(name)) {
      return { ok: false, error: "Name your template so you can reuse it on future episodes." };
    }
    return { ok: true };
  }

  // Capture the reusable identity from a live design. Speaker names are intentionally NOT
  // stored — only which roles were hidden — so the template adapts to future episodes.
  function templateFromDesign(name, design) {
    const hiddenRoles = (design.frames || [])
      .filter((frame) => !frame.visible)
      .map((frame) => frame.role);
    return {
      id: slugify(name),
      name: trim(name),
      presetId: design.presetId,
      presetName: design.presetName,
      layout: design.layout,
      background: design.background,
      accent: design.accent,
      textColor: design.textColor,
      captionStyle: design.captionStyle,
      title: { visible: design.title.visible, text: design.title.text },
      caption: { visible: design.caption.visible, style: design.caption.style },
      overlay: { visible: design.overlay.visible, label: design.overlay.label },
      hiddenRoles: hiddenRoles,
    };
  }

  // Save a design as a named template in the store. Reusing a name updates that template
  // in place rather than creating a duplicate. Returns the saved template or an error.
  function saveTemplate(store, name, design) {
    const check = validateTemplateName(name);
    if (!check.ok) {
      return { ok: false, error: check.error };
    }
    const target = store && Array.isArray(store.templates) ? store : createTemplateStore();
    const template = templateFromDesign(name, design);
    const existing = target.templates.findIndex((entry) => entry.id === template.id);
    if (existing >= 0) {
      target.templates[existing] = template;
    } else {
      target.templates.push(template);
    }
    return { ok: true, template: template, store: target };
  }

  function listTemplates(store) {
    return store && Array.isArray(store.templates) ? store.templates.slice() : [];
  }

  function getTemplate(store, id) {
    return listTemplates(store).find((entry) => entry.id === id) || null;
  }

  // Reselect a saved template for an episode: rebuild a live, editable design that keeps
  // the template's identity but draws a frame for each of THIS episode's speakers. This is
  // the "saved template available for future episode use" path.
  function applyTemplate(template, speakers) {
    const look = {
      presetId: template.presetId,
      presetName: template.presetName,
      layout: template.layout,
      background: template.background,
      accent: template.accent,
      textColor: template.textColor,
      captionStyle: template.captionStyle,
      title: { visible: template.title.visible, text: template.title.text },
      caption: { visible: template.caption.visible, style: template.caption.style },
      overlay: { visible: template.overlay.visible, label: template.overlay.label },
      hiddenRoles: template.hiddenRoles || [],
    };
    return designFromLook(look, speakers);
  }

  const api = {
    ELEMENT_KINDS,
    TOGGLE_SECTIONS,
    slugify,
    createDesign,
    setBackground,
    setAccent,
    setTitleText,
    setOverlayLabel,
    toggleSection,
    toggleFrame,
    elementList,
    summarizeDesign,
    createTemplateStore,
    validateTemplateName,
    templateFromDesign,
    saveTemplate,
    listTemplates,
    getTemplate,
    applyTemplate,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcCanvasEditor = api;
}(typeof window !== "undefined" ? window : globalThis));

"use strict";

// Reusable canvas editor model for Podcast Design Canvas (#11 — the canvas editor step).
//
// This is the single source of truth for turning a chosen preset style into a personal,
// reusable show layout. A creator opens the preset they picked as a starting point, adjusts
// the visible layout elements (background, title, captions, overlay area, and the speaker
// frames built from their real Host/Guest buckets), then saves the result as a named show
// template that later episodes can reuse. Like the rest of the app it is deliberately
// DOM-free, so the same rules drive the on-screen editor and the tests. No build, no deps.
(function (global) {
  // A safe caption look the creator can switch between without thinking about type settings.
  const CAPTION_STYLES = [
    { id: "lower-third", label: "Lower third" },
    { id: "centered", label: "Centered band" },
    { id: "minimal", label: "Minimal tag" },
  ];

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clampText(value, max) {
    const text = trim(value);
    return text.length > max ? text.slice(0, max) : text;
  }

  function getCaptionStyle(id) {
    return CAPTION_STYLES.find((style) => style.id === id) || CAPTION_STYLES[0];
  }

  // A frame for each assigned speaker, in setup order. The label defaults to the speaker's
  // name (so the canvas reads correctly out of the box) but can be renamed on screen. Every
  // speaker keeps a frame — the editor personalizes the look, it never drops a speaker.
  function framesFromSummary(summary) {
    const speakers = (summary && Array.isArray(summary.speakers) && summary.speakers) || [];
    return speakers.map((speaker, index) => ({
      role: trim(speaker && speaker.role) || `Speaker ${index + 1}`,
      name: trim(speaker && speaker.name) || "Unnamed speaker",
      label: trim(speaker && speaker.name) || `Speaker ${index + 1}`,
      showLabel: true,
    }));
  }

  // Open the canvas editor on the style the creator chose. The preset supplies the starting
  // colors, caption treatment, and resolved layout; the episode supplies the real speakers.
  // `style` is the applied-style summary from PdcEpisodeStyle.summarizeStyle.
  function openDesign(style, summary) {
    const applied = style && typeof style === "object" ? style : {};
    const episodeName = trim(summary && summary.episodeName) || "Untitled episode";
    return {
      presetId: applied.presetId || "",
      presetName: applied.presetName || "Custom style",
      layoutId: applied.layoutId || "spotlight",
      layoutLabel: applied.layoutLabel || "Spotlight",
      pacingLabel: applied.pacingLabel || "Balanced",
      accent: applied.accent || "#ffb347",
      textColor: applied.textColor || "#f6f7fb",
      background: applied.background || "#10131f",
      title: { text: episodeName, visible: true },
      caption: { text: "Sample caption — this is how on-screen text will look.", style: defaultCaptionFor(applied), visible: true },
      overlay: { text: "@yourshow", visible: false },
      frames: framesFromSummary(summary),
    };
  }

  // Map the preset's described caption treatment to one of the editor's adjustable styles,
  // so opening the editor reflects the look the creator already previewed.
  function defaultCaptionFor(applied) {
    const described = trim(applied && applied.captionStyle).toLowerCase();
    if (described.indexOf("minimal") >= 0 || described.indexOf("tag") >= 0) {
      return "minimal";
    }
    if (described.indexOf("animated") >= 0 || described.indexOf("center") >= 0) {
      return "centered";
    }
    return "lower-third";
  }

  // ---- Element edits (pure: each returns the same design after a guarded change) ----------

  function setBackground(design, hex) {
    const value = trim(hex);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      design.background = value;
    }
    return design;
  }

  function setTitleText(design, text) {
    design.title.text = clampText(text, 80);
    return design;
  }

  function setCaptionText(design, text) {
    design.caption.text = clampText(text, 120);
    return design;
  }

  function setCaptionStyle(design, styleId) {
    design.caption.style = getCaptionStyle(styleId).id;
    return design;
  }

  function setOverlayText(design, text) {
    design.overlay.text = clampText(text, 40);
    return design;
  }

  function setFrameLabel(design, index, label) {
    const frame = design.frames[index];
    if (frame) {
      frame.label = clampText(label, 40) || frame.name;
    }
    return design;
  }

  // Toggle a customizable element's visibility. Speaker frames are addressed as `frame:<i>`
  // and never all hidden at once — a podcast layout must always show at least one speaker.
  function toggleElement(design, elementId) {
    if (elementId === "title") {
      design.title.visible = !design.title.visible;
    } else if (elementId === "caption") {
      design.caption.visible = !design.caption.visible;
    } else if (elementId === "overlay") {
      design.overlay.visible = !design.overlay.visible;
    } else if (elementId.indexOf("frame:") === 0) {
      const index = Number(elementId.slice("frame:".length));
      const frame = design.frames[index];
      if (frame) {
        const visibleCount = design.frames.filter((f) => f.showLabel).length;
        if (frame.showLabel && visibleCount <= 1) {
          return design; // keep at least one speaker labelled on the canvas
        }
        frame.showLabel = !frame.showLabel;
      }
    }
    return design;
  }

  // A flat description of every customizable element, for the editor controls and for tests.
  // `value` is the current setting so a reviewer (or assertion) can see what changed.
  function describeElements(design) {
    const elements = [
      { id: "background", label: "Background", kind: "color", value: design.background },
      { id: "title", label: "Title text", kind: "text", value: design.title.text, visible: design.title.visible },
      { id: "caption", label: "Captions", kind: "text", value: design.caption.text, visible: design.caption.visible },
      { id: "overlay", label: "Overlay area", kind: "text", value: design.overlay.text, visible: design.overlay.visible },
    ];
    design.frames.forEach((frame, index) => {
      elements.push({
        id: `frame:${index}`,
        label: `${frame.role} frame`,
        kind: "frame",
        value: frame.label,
        visible: frame.showLabel,
      });
    });
    return elements;
  }

  // ---- Named show templates ---------------------------------------------------------------

  function slugify(name) {
    const base = trim(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || "show-template";
  }

  // A save name must be present and not collide with an existing template, so the creator's
  // saved looks stay distinct and findable later.
  function validateTemplateName(name, existingNames) {
    const value = trim(name);
    if (!value) {
      return { ok: false, error: "Name your show template so you can reuse it on future episodes." };
    }
    const taken = (Array.isArray(existingNames) ? existingNames : []).map((n) => trim(n).toLowerCase());
    if (taken.indexOf(value.toLowerCase()) >= 0) {
      return { ok: false, error: "You already have a template with that name — choose a different one." };
    }
    return { ok: true, error: "" };
  }

  // A frozen snapshot of the design's visual identity. Frames are stored as roles + labels
  // so the identity can re-adapt to a future episode's actual speakers.
  function snapshotDesign(design) {
    return {
      presetId: design.presetId,
      presetName: design.presetName,
      layoutId: design.layoutId,
      layoutLabel: design.layoutLabel,
      pacingLabel: design.pacingLabel,
      accent: design.accent,
      textColor: design.textColor,
      background: design.background,
      title: { text: design.title.text, visible: design.title.visible },
      caption: { text: design.caption.text, style: design.caption.style, visible: design.caption.visible },
      overlay: { text: design.overlay.text, visible: design.overlay.visible },
      frames: design.frames.map((frame) => ({
        role: frame.role,
        label: frame.label,
        showLabel: frame.showLabel,
      })),
    };
  }

  // Reuse a saved template on an episode: keep the saved visual identity but rebuild the
  // speaker frames from THIS episode's real speakers. Frame labels come from the new
  // speakers (names are episode-specific), while the saved per-role structural choice —
  // whether that role's nameplate shows — carries over. Same show identity, new speakers.
  function applyTemplate(template, summary) {
    const saved = (template && template.design) || {};
    const frames = framesFromSummary(summary).map((frame) => {
      const match = (saved.frames || []).find((f) => f.role === frame.role);
      if (match) {
        return { role: frame.role, name: frame.name, label: frame.label, showLabel: match.showLabel !== false };
      }
      return frame;
    });
    return {
      presetId: saved.presetId || "",
      presetName: saved.presetName || "Custom style",
      layoutId: saved.layoutId || "spotlight",
      layoutLabel: saved.layoutLabel || "Spotlight",
      pacingLabel: saved.pacingLabel || "Balanced",
      accent: saved.accent || "#ffb347",
      textColor: saved.textColor || "#f6f7fb",
      background: saved.background || "#10131f",
      title: { text: (saved.title && saved.title.text) || trim(summary && summary.episodeName) || "Untitled episode", visible: !saved.title || saved.title.visible !== false },
      caption: {
        text: (saved.caption && saved.caption.text) || "Sample caption — this is how on-screen text will look.",
        style: getCaptionStyle(saved.caption && saved.caption.style).id,
        visible: !saved.caption || saved.caption.visible !== false,
      },
      overlay: { text: (saved.overlay && saved.overlay.text) || "", visible: Boolean(saved.overlay && saved.overlay.visible) },
      frames: frames,
    };
  }

  // A tiny persistent store for saved templates. Storage is injectable (a localStorage-like
  // object with getItem/setItem) so the browser persists across episodes while tests run
  // against an in-memory store. Templates are keyed by a stable slug of their name.
  function createTemplateStore(storage) {
    const KEY = "pdc.show-templates.v1";
    const mem = {};
    const backing = storage && typeof storage.getItem === "function"
      ? storage
      : { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };

    function readAll() {
      try {
        const raw = backing.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        return [];
      }
    }

    function writeAll(list) {
      backing.setItem(KEY, JSON.stringify(list));
    }

    function list() {
      return readAll();
    }

    function names() {
      return readAll().map((template) => template.name);
    }

    function get(id) {
      return readAll().find((template) => template.id === id) || null;
    }

    // Save a named template from the current design. Validates the name against existing
    // ones, snapshots the design, and returns { ok, template, error }.
    function save(name, design) {
      const check = validateTemplateName(name, names());
      if (!check.ok) {
        return { ok: false, error: check.error, template: null };
      }
      const all = readAll();
      let id = slugify(name);
      let suffix = 2;
      while (all.some((template) => template.id === id)) {
        id = `${slugify(name)}-${suffix}`;
        suffix += 1;
      }
      const template = {
        id,
        name: trim(name),
        presetName: design.presetName,
        layoutLabel: design.layoutLabel,
        speakerCount: design.frames.length,
        design: snapshotDesign(design),
      };
      all.push(template);
      writeAll(all);
      return { ok: true, error: "", template };
    }

    return { list, names, get, save };
  }

  const api = {
    CAPTION_STYLES,
    getCaptionStyle,
    openDesign,
    setBackground,
    setTitleText,
    setCaptionText,
    setCaptionStyle,
    setOverlayText,
    setFrameLabel,
    toggleElement,
    describeElements,
    validateTemplateName,
    snapshotDesign,
    applyTemplate,
    slugify,
    createTemplateStore,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcCanvasEditor = api;
}(typeof window !== "undefined" ? window : globalThis));

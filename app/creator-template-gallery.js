"use strict";

// Creator template gallery for Podcast Design Canvas (#106).
//
// Lets power users publish saved show layouts as reusable gallery listings other
// shows can browse, preview, and apply. DOM-free — persistence is handled by the UI.
(function (global) {
  let listingCounter = 0;

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

  function setupApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./episode-setup.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcEpisodeSetup;
  }

  function editorApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./canvas-editor.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcCanvasEditor;
  }

  function brandKitApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./show-brand-kit.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcShowBrandKit;
  }

  // Sample layouts so a fresh sandbox can browse, preview, and apply immediately.
  const STARTER_SPECS = [
    {
      id: "gallery-starter-split-interview",
      name: "Split Interview Studio",
      description: "Side-by-side speaker frames with clean captions — ideal for two-person interviews.",
      styleTags: ["interview", "grid", "split-stage"],
      presetId: "split-stage",
      layout: "split",
      titleText: "Founders Unfiltered",
      captionText: "Two founders, one honest conversation.",
      brandKit: { logoLabel: "FU", colors: { background: "#15192b", accent: "#e0563b", text: "#ffffff" }, captionStyle: "clean-bar" },
    },
    {
      id: "gallery-starter-spotlight-brand",
      name: "Spotlight Brand Show",
      description: "Active-speaker spotlight with bold lower-thirds and on-brand overlays.",
      styleTags: ["spotlight", "brand-forward", "bold-captions"],
      presetId: "studio-spotlight",
      layout: "spotlight",
      titleText: "Building In Public",
      captionText: "Welcome back — let's dive in.",
      brandKit: { logoLabel: "BIP", colors: { background: "#10131f", accent: "#ffb347", text: "#f6f7fb" }, captionStyle: "bold-lower-third" },
    },
    {
      id: "gallery-starter-panel-roundtable",
      name: "Panel Roundtable",
      description: "Balanced grid that keeps every guest on screen with minimal name tags.",
      styleTags: ["grid", "minimal", "panel-grid"],
      presetId: "panel-grid",
      layout: "grid",
      titleText: "The Weekly Panel",
      captionText: "The whole panel weighs in on this week's news.",
      brandKit: { logoLabel: "PANEL", colors: { background: "#0f1a2b", accent: "#4dd0e1", text: "#eaf6fb" }, captionStyle: "minimal-tag" },
    },
  ];

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function createGallery() {
    return { listings: [] };
  }

  function cloneCanvas(canvas) {
    return JSON.parse(JSON.stringify(canvas));
  }

  function cloneListing(listing) {
    return Object.assign({}, listing, {
      styleTags: Array.isArray(listing.styleTags) ? listing.styleTags.slice() : [],
      previewImage: Object.assign({}, listing.previewImage || {}),
      canvas: cloneCanvas(listing.canvas),
    });
  }

  function normalizeName(name) {
    return trim(name);
  }

  function normalizeTags(tags) {
    if (Array.isArray(tags)) {
      return tags.map((tag) => trim(tag)).filter(Boolean);
    }
    if (typeof tags === "string") {
      return tags.split(/[,;]+/).map((tag) => trim(tag)).filter(Boolean);
    }
    return [];
  }

  function buildPreviewImage(canvas) {
    if (!canvas) {
      return {
        background: "#10131f",
        accent: "#6c4cff",
        layoutId: "grid",
        presetName: "Custom",
        titleText: "",
        captionText: "",
      };
    }
    return {
      background: canvas.background || "#10131f",
      accent: canvas.accent || "#6c4cff",
      layoutId: canvas.layoutId || "grid",
      presetName: canvas.presetName || "Custom",
      titleText: canvas.titleText || "",
      captionText: canvas.captionText || "",
      presetId: canvas.presetId || "",
    };
  }

  function deriveStyleTags(canvas) {
    const tags = [];
    if (!canvas) {
      return tags;
    }
    if (canvas.presetName) {
      tags.push(canvas.presetName.toLowerCase().replace(/\s+/g, "-"));
    }
    if (canvas.layoutId) {
      tags.push(canvas.layoutId);
    }
    if (canvas.pacingId) {
      tags.push(canvas.pacingId);
    }
    if (canvas.presetId) {
      tags.push(canvas.presetId);
    }
    return [...new Set(tags)];
  }

  function validateListingName(gallery, name, excludeId) {
    const trimmed = normalizeName(name);
    if (!trimmed) {
      return { ok: false, error: "Give your gallery template a name." };
    }
    const list = gallery && Array.isArray(gallery.listings) ? gallery.listings : [];
    const duplicate = list.find(
      (listing) => listing.name.toLowerCase() === trimmed.toLowerCase() && listing.id !== excludeId,
    );
    if (duplicate) {
      return { ok: false, error: "A gallery template with that name already exists." };
    }
    return { ok: true, name: trimmed };
  }

  function createListing(meta, canvas, id) {
    listingCounter += 1;
    const previewImage = meta.previewImage || buildPreviewImage(canvas);
    return {
      id: id || `gal-${listingCounter}`,
      name: normalizeName(meta.name),
      description: trim(meta.description),
      styleTags: normalizeTags(meta.styleTags !== undefined ? meta.styleTags : deriveStyleTags(canvas)),
      previewImage,
      canvas: cloneCanvas(canvas),
      sourceTemplateId: meta.sourceTemplateId || null,
      creatorName: trim(meta.creatorName) || "Creator",
      publishedAt: Date.now(),
    };
  }

  function saveListing(gallery, listing) {
    const next = createGallery();
    const existing = gallery && Array.isArray(gallery.listings) ? gallery.listings : [];
    next.listings = existing.slice();
    const index = next.listings.findIndex((item) => item.id === listing.id);
    if (index >= 0) {
      next.listings[index] = cloneListing(listing);
    } else {
      next.listings.push(cloneListing(listing));
    }
    next.listings.sort((a, b) => a.name.localeCompare(b.name));
    return next;
  }

  function publishListing(gallery, template, meta) {
    if (!template || !template.canvas) {
      return gallery || createGallery();
    }
    const listingMeta = Object.assign({}, meta || {}, {
      sourceTemplateId: (meta && meta.sourceTemplateId) || template.id || null,
    });
    const listing = createListing(listingMeta, template.canvas);
    return saveListing(gallery, listing);
  }

  function listListings(gallery) {
    const list = gallery && Array.isArray(gallery.listings) ? gallery.listings : [];
    return list.map((listing) => ({
      id: listing.id,
      name: listing.name,
      description: listing.description,
      styleTags: Array.isArray(listing.styleTags) ? listing.styleTags.slice() : [],
      previewImage: Object.assign({}, listing.previewImage || {}),
      creatorName: listing.creatorName,
      publishedAt: listing.publishedAt,
      presetName: listing.previewImage && listing.previewImage.presetName,
      sourceTemplateId: listing.sourceTemplateId,
    }));
  }

  function getListing(gallery, id) {
    const list = gallery && Array.isArray(gallery.listings) ? gallery.listings : [];
    const found = list.find((listing) => listing.id === id);
    if (!found) {
      return null;
    }
    return cloneListing(found);
  }

  function applyListingForEpisode(listing, episodeSummary, styleSelection) {
    const TM = templatesApi();
    if (!TM || !listing || !listing.canvas) {
      return null;
    }
    return TM.applyTemplateForEpisode({ canvas: listing.canvas }, episodeSummary, styleSelection);
  }

  function styleSelectionFromListing(listing) {
    const TM = templatesApi();
    if (!TM || !listing) {
      return null;
    }
    return TM.styleSelectionFromCanvas(listing.canvas);
  }

  function serializeGallery(gallery) {
    return JSON.stringify(gallery || createGallery());
  }

  function deserializeGallery(json) {
    if (!json) {
      return createGallery();
    }
    try {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.listings)) {
        return createGallery();
      }
      return { listings: parsed.listings };
    } catch (err) {
      return createGallery();
    }
  }

  function buildCanvasFromSpec(spec) {
    const setup = setupApi();
    const STY = styleApi();
    const CE = editorApi();
    const BK = brandKitApi();
    if (!setup || !STY || !CE || !spec) {
      return null;
    }
    const draft = setup.createDraft();
    draft.episodeName = "Gallery preview episode";
    draft.sourceMode = "upload";
    draft.speakers = [
      Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "host.mp4" }),
      Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "guest.mp4" }),
      Object.assign(setup.createSpeaker("Guest 2"), { name: "Alex Chen", fileName: "guest2.mp4" }),
    ];
    const episode = setup.summarize(draft);
    const selection = STY.createSelection();
    selection.presetId = spec.presetId;
    selection.layout = spec.layout;
    const applied = STY.summarizeStyle(selection, episode.speakerCount);
    let doc = CE.createFromStyle(applied, episode, selection);
    doc = CE.updateElement(doc, "titleText", spec.titleText);
    doc = CE.updateElement(doc, "captionText", spec.captionText);
    if (BK && spec.brandKit) {
      const kit = BK.createBrandKit("gallery-starter", spec.brandKit);
      doc = BK.applyToCanvas(doc, kit);
    }
    return doc;
  }

  function ensureStarterGallery(gallery) {
    const base = gallery && Array.isArray(gallery.listings) ? gallery : createGallery();
    if (base.listings.length > 0) {
      return base;
    }
    let next = createGallery();
    STARTER_SPECS.forEach((spec) => {
      const canvas = buildCanvasFromSpec(spec);
      if (!canvas) {
        return;
      }
      const listing = createListing({
        name: spec.name,
        description: spec.description,
        styleTags: spec.styleTags,
        previewImage: buildPreviewImage(canvas),
        creatorName: "Podcast Design Canvas",
      }, canvas, spec.id);
      next = saveListing(next, listing);
    });
    return next;
  }

  function _resetListingCounter() {
    listingCounter = 0;
  }

  const api = {
    STARTER_SPECS,
    createGallery,
    buildPreviewImage,
    deriveStyleTags,
    validateListingName,
    createListing,
    saveListing,
    publishListing,
    listListings,
    getListing,
    applyListingForEpisode,
    styleSelectionFromListing,
    ensureStarterGallery,
    serializeGallery,
    deserializeGallery,
    _resetListingCounter,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcCreatorGallery = api;
}(typeof window !== "undefined" ? window : globalThis));

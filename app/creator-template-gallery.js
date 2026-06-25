"use strict";

// Creator template gallery for Podcast Design Canvas (#106).
//
// Lets power users publish saved show layouts as browsable creator templates with
// metadata and preview art. DOM-free — persistence is handled by the UI layer.
(function (global) {
  let listingCounter = 0;

  const STYLE_TAGS = [
    { id: "spotlight", label: "Spotlight" },
    { id: "grid", label: "Grid layout" },
    { id: "interview", label: "Interview" },
    { id: "bold-captions", label: "Bold captions" },
    { id: "brand-forward", label: "Brand-forward" },
    { id: "minimal", label: "Minimal" },
  ];

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

  function brandKitApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./show-brand-kit.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcShowBrandKit;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function createGallery() {
    return { listings: [] };
  }

  function getStyleTag(id) {
    return STYLE_TAGS.find((tag) => tag.id === id) || null;
  }

  function normalizeStyleTags(tags) {
    const raw = Array.isArray(tags) ? tags : [];
    const seen = new Set();
    const normalized = [];
    raw.forEach((tag) => {
      const id = trim(tag).toLowerCase();
      if (!id || seen.has(id) || !getStyleTag(id)) {
        return;
      }
      seen.add(id);
      normalized.push(id);
    });
    return normalized;
  }

  function validateListingDraft(draft) {
    const name = trim(draft && draft.name);
    const description = trim(draft && draft.description);
    const styleTags = normalizeStyleTags(draft && draft.styleTags);
    if (!name) {
      return { ok: false, error: "Give the gallery listing a name." };
    }
    if (!description) {
      return { ok: false, error: "Add a short description so other creators know what this layout is for." };
    }
    if (!styleTags.length) {
      return { ok: false, error: "Pick at least one style tag." };
    }
    return { ok: true, name, description, styleTags };
  }

  function escapeXml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildPreviewImage(canvasDoc, brandKit) {
    const doc = canvasDoc || {};
    const kit = brandKit || {};
    const colors = kit.colors || {};
    const background = colors.background || doc.background || "#10131f";
    const accent = colors.accent || doc.accent || "#6c4cff";
    const text = colors.text || doc.textColor || "#f6f7fb";
    const title = escapeXml(doc.titleText || doc.presetName || "Creator template");
    const frameCount = Math.min(Math.max((doc.speakerFrames || []).length, 1), 3);
    const frameRects = [];
    const gap = 10;
    const width = 320;
    const height = 180;
    const frameWidth = (width - gap * (frameCount + 1)) / frameCount;
    for (let i = 0; i < frameCount; i += 1) {
      const x = gap + i * (frameWidth + gap);
      frameRects.push(
        `<rect x="${x}" y="58" width="${frameWidth}" height="72" rx="10" fill="${escapeXml(accent)}" opacity="0.22" stroke="${escapeXml(accent)}" stroke-width="2"/>`,
      );
    }
    const logo = kit.logoLabel ? `<text x="16" y="24" fill="${escapeXml(accent)}" font-size="11" font-family="Inter,Segoe UI,sans-serif" font-weight="700">${escapeXml(kit.logoLabel)}</text>` : "";
    const caption = doc.captionText
      ? `<rect x="16" y="142" width="188" height="24" rx="8" fill="${escapeXml(accent)}"/><text x="24" y="158" fill="#10131f" font-size="10" font-family="Inter,Segoe UI,sans-serif" font-weight="700">${escapeXml(doc.captionText.slice(0, 28))}</text>`
      : "";
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<rect width="${width}" height="${height}" rx="14" fill="${escapeXml(background)}"/>`,
      logo,
      `<text x="16" y="${kit.logoLabel ? 42 : 28}" fill="${escapeXml(text)}" font-size="14" font-family="Inter,Segoe UI,sans-serif" font-weight="700">${title}</text>`,
      frameRects.join(""),
      caption,
      `</svg>`,
    ].join("");
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function createListingFromSavedTemplate(options) {
    const opts = options || {};
    const template = opts.template;
    if (!template || !template.canvas) {
      return { ok: false, error: "Save a show template before publishing to the gallery." };
    }
    const draftCheck = validateListingDraft({
      name: opts.name || template.name,
      description: opts.description,
      styleTags: opts.styleTags,
    });
    if (!draftCheck.ok) {
      return draftCheck;
    }
    listingCounter += 1;
    const listing = {
      id: opts.id || `gallery-${listingCounter}`,
      name: draftCheck.name,
      description: draftCheck.description,
      styleTags: draftCheck.styleTags,
      previewImage: opts.previewImage || buildPreviewImage(template.canvas, opts.brandKit),
      canvas: clone(template.canvas),
      brandKit: opts.brandKit ? clone(opts.brandKit) : null,
      sourceTemplateId: template.id || "",
      publishedAt: Date.now(),
      presetName: template.canvas.presetName || "",
      titleText: template.canvas.titleText || "",
    };
    return { ok: true, listing };
  }

  function publishListing(gallery, listing) {
    const next = createGallery();
    const existing = gallery && Array.isArray(gallery.listings) ? gallery.listings : [];
    next.listings = existing.slice();
    const duplicate = next.listings.find(
      (item) => item.name.toLowerCase() === listing.name.toLowerCase() && item.id !== listing.id,
    );
    if (duplicate) {
      return { ok: false, error: "A gallery listing with that name already exists." };
    }
    const index = next.listings.findIndex((item) => item.id === listing.id);
    if (index >= 0) {
      next.listings[index] = clone(listing);
    } else {
      next.listings.push(clone(listing));
    }
    next.listings.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, gallery: next, listing: clone(listing) };
  }

  function listListings(gallery) {
    const list = gallery && Array.isArray(gallery.listings) ? gallery.listings : [];
    return list.map((listing) => ({
      id: listing.id,
      name: listing.name,
      description: listing.description,
      styleTags: listing.styleTags.slice(),
      styleTagLabels: listing.styleTags.map((tag) => (getStyleTag(tag) || { label: tag }).label),
      previewImage: listing.previewImage,
      presetName: listing.presetName,
      titleText: listing.titleText,
      publishedAt: listing.publishedAt,
    }));
  }

  function getListing(gallery, id) {
    const list = gallery && Array.isArray(gallery.listings) ? gallery.listings : [];
    const found = list.find((listing) => listing.id === id);
    if (!found) {
      return null;
    }
    return clone(found);
  }

  function buildPreviewCanvas(listing, episodeSummary, styleSelection) {
    const TM = templatesApi();
    const BK = brandKitApi();
    if (!listing || !listing.canvas || !TM) {
      return null;
    }
    const pseudoTemplate = { canvas: listing.canvas };
    const fromCanvas = TM.styleSelectionFromCanvas(listing.canvas);
    const selection = fromCanvas || styleSelection || null;
    let canvasDoc = TM.applyTemplateForEpisode(pseudoTemplate, episodeSummary, selection);
    if (listing.brandKit && BK && canvasDoc) {
      canvasDoc = BK.applyToCanvas(canvasDoc, listing.brandKit);
    }
    return canvasDoc;
  }

  function applyListing(listing, episodeSummary, styleSelection) {
    const TM = templatesApi();
    const STY = styleApi();
    const BK = brandKitApi();
    if (!listing || !listing.canvas || !TM || !STY) {
      return { ok: false, error: "This gallery template is unavailable." };
    }
    const pseudoTemplate = { canvas: listing.canvas };
    const fromCanvas = TM.styleSelectionFromCanvas(listing.canvas);
    const selection = clone(fromCanvas || styleSelection || STY.createSelection());
    let canvasDoc = TM.applyTemplateForEpisode(pseudoTemplate, episodeSummary, selection);
    let appliedStyle = STY.summarizeStyle(selection, episodeSummary.speakerCount);
    const brandKit = listing.brandKit ? clone(listing.brandKit) : null;
    if (brandKit && BK) {
      if (canvasDoc) {
        canvasDoc = BK.applyToCanvas(canvasDoc, brandKit);
      }
      appliedStyle = BK.applyToStyleSummary(appliedStyle, brandKit);
    }
    return {
      ok: true,
      styleSelection: selection,
      canvasDoc,
      appliedStyle,
      brandKit,
      listingId: listing.id,
      listingName: listing.name,
    };
  }

  function summarizeListing(listing) {
    if (!listing) {
      return "";
    }
    const tags = normalizeStyleTags(listing.styleTags)
      .map((tag) => (getStyleTag(tag) || { label: tag }).label)
      .join(", ");
    return `${listing.name} · ${listing.presetName || "Custom"}${tags ? ` · ${tags}` : ""}`;
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

  function _resetListingCounter() {
    listingCounter = 0;
  }

  const api = {
    STYLE_TAGS,
    createGallery,
    getStyleTag,
    normalizeStyleTags,
    validateListingDraft,
    buildPreviewImage,
    createListingFromSavedTemplate,
    publishListing,
    listListings,
    getListing,
    buildPreviewCanvas,
    applyListing,
    summarizeListing,
    serializeGallery,
    deserializeGallery,
    _resetListingCounter,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcCreatorTemplateGallery = api;
}(typeof window !== "undefined" ? window : globalThis));

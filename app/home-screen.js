"use strict";

// Home screen plan for Podcast Design Canvas (#112).
//
// The first screen a creator sees after `Episode Import` is the show library
// dashboard. Earlier iterations exposed five equal-weight CTAs at the top,
// which diluted the primary "start a new episode" workflow and left the
// creator template gallery card looking like a stub. This module is a
// DOM-free helper that produces a single `homePlan` the UI consumes:
//
//   {
//     primary:   { id, label, hint, actionId, badge },
//     secondary: [{ id, label, hint, actionId }, ...]   // quiet, link-style
//     gallery:   { visible, previews: [{ id, name, presetName, creatorName,
//                                        accent, background, layoutId }] }
//     hasDraft:  boolean
//   }
//
// The UI still wires the actual click handlers — `actionId` is a stable
// string the UI knows how to dispatch ("create-show", "open-style-demo",
// "open-gallery-demo", "open-gallery-browse", "open-publish-demo",
// "start-blank-episode"). This keeps the plan easy to test without a DOM.
// Run with: `node tests/home-screen.test.js`.
(function (global) {
  const PRIMARY_DEFAULT = {
    id: "create-show",
    label: "Create a new show →",
    hint: "Name your show, then import your first recording and assign Host / Guest speakers.",
    actionId: "create-show",
    badge: "Start here",
  };

  const PRIMARY_WITH_DRAFT = {
    id: "resume-latest",
    label: "Resume your latest episode →",
    hint: "Pick up where you left off, or start a new episode for this show.",
    actionId: "resume-latest",
    badge: "Pick up where you left off",
  };

  const SECONDARY_BASE = [
    {
      id: "open-style-demo",
      label: "See style preset cards",
      hint: "Preview preset layouts on a sample episode.",
      actionId: "open-style-demo",
    },
    {
      id: "open-gallery-demo",
      label: "Try the creator gallery",
      hint: "Browse sample gallery layouts and apply one to a fresh episode.",
      actionId: "open-gallery-demo",
    },
    {
      id: "open-gallery-browse",
      label: "Browse creator gallery",
      hint: "Open your saved gallery listings without seeding demo data.",
      actionId: "open-gallery-browse",
    },
    {
      id: "open-publish-demo",
      label: "Try the publish flow",
      hint: "Walk through publishing a saved layout to the gallery.",
      actionId: "open-publish-demo",
    },
    {
      id: "start-blank-episode",
      label: "Start a blank episode",
      hint: "Skip the show wrapper and go straight to episode setup.",
      actionId: "start-blank-episode",
    },
  ];

  const MAX_GALLERY_THUMBS = 3;

  function listShows(libraryApi, library) {
    if (!libraryApi) {
      return [];
    }
    const raw = library && Array.isArray(library.shows) ? library.shows : [];
    if (typeof libraryApi.listShows === "function") {
      return libraryApi.listShows(library || { shows: [] });
    }
    return raw.slice();
  }

  function listListings(galleryApi, gallery) {
    if (!galleryApi || typeof galleryApi.listListings !== "function") {
      return [];
    }
    return galleryApi.listListings(gallery || { listings: [] });
  }

  function latestDraft(episodes) {
    const list = Array.isArray(episodes) ? episodes.slice() : [];
    list.sort(function (a, b) {
      return (b && b.updatedAt ? b.updatedAt : b && b.createdAt ? b.createdAt : 0)
        - (a && a.updatedAt ? a.updatedAt : a && a.createdAt ? a.createdAt : 0);
    });
    for (let i = 0; i < list.length; i += 1) {
      const ep = list[i];
      if (ep && (ep.status === "draft" || ep.status === "in-progress")) {
        return ep;
      }
    }
    return null;
  }

  function collectDrafts(libraryApi, library) {
    const shows = library && Array.isArray(library.shows) ? library.shows : [];
    const drafts = [];
    shows.forEach(function (show) {
      if (!show || !Array.isArray(show.episodes)) {
        return;
      }
      const draft = latestDraft(show.episodes);
      if (draft) {
        drafts.push({ show: show, episode: draft });
      }
    });
    return drafts;
  }

  function resolvePrimary(libraryApi, library, options) {
    const rawShows = library && Array.isArray(library.shows) ? library.shows : [];
    if (!rawShows.length) {
      return Object.assign({}, PRIMARY_DEFAULT);
    }
    const drafts = collectDrafts(libraryApi, library);
    if (!drafts.length) {
      return Object.assign({}, PRIMARY_DEFAULT, {
        showId: rawShows[0].id,
      });
    }
    drafts.sort(function (a, b) {
      const aAt = (a.episode && a.episode.updatedAt) || (a.episode && a.episode.createdAt) || 0;
      const bAt = (b.episode && b.episode.updatedAt) || (b.episode && b.episode.createdAt) || 0;
      return bAt - aAt;
    });
    const top = drafts[0];
    const episode = top.episode;
    const show = top.show;
    const opts = options || {};
    const customLabel = opts.primaryLabel;
    const customHint = opts.primaryHint;
    return Object.assign({}, PRIMARY_WITH_DRAFT, {
      showId: show && show.id,
      episodeId: episode && episode.id,
      episodeName: episode && episode.name,
      label: customLabel || `Resume “${episode && episode.name ? episode.name : "your latest episode"}” →`,
      hint: customHint
        || (show && show.name
          ? `On “${show.name}”. Pick up where you left off, or start a new episode for this show.`
          : "Pick up where you left off, or start a new episode for this show."),
    });
  }

  function buildGalleryPlan(galleryApi, gallery, options) {
    const opts = options || {};
    const forceVisible = opts.galleryVisible !== false;
    const all = listListings(galleryApi, gallery);
    const previews = all.slice(0, MAX_GALLERY_THUMBS).map(function (listing) {
      const preview = (listing && listing.previewImage) || {};
      return {
        id: listing.id,
        name: listing.name,
        presetName: preview.presetName || listing.presetName || "Custom layout",
        creatorName: listing.creatorName || "Creator",
        accent: preview.accent || "#6c4cff",
        background: preview.background || "#10131f",
        layoutId: preview.layoutId || "grid",
        actionId: "apply-gallery-listing",
      };
    });
    return {
      visible: forceVisible,
      hasListings: all.length > 0,
      previews: previews,
      maxPreviews: MAX_GALLERY_THUMBS,
    };
  }

  function buildHomePlan(opts) {
    const options = opts || {};
    const libraryApi = options.libraryApi || null;
    const galleryApi = options.galleryApi || null;
    const library = options.library || { shows: [] };
    const gallery = options.gallery || { listings: [] };
    const shows = listShows(libraryApi, library);
    const primary = resolvePrimary(libraryApi, library, options);
    const hasDraft = Boolean(primary && primary.episodeId);
    const secondary = SECONDARY_BASE.slice();
    const galleryPlan = buildGalleryPlan(galleryApi, gallery, options);
    return {
      primary: primary,
      secondary: secondary,
      gallery: galleryPlan,
      hasDraft: hasDraft,
      showCount: shows.length,
    };
  }

  const api = {
    PRIMARY_DEFAULT: PRIMARY_DEFAULT,
    PRIMARY_WITH_DRAFT: PRIMARY_WITH_DRAFT,
    SECONDARY_BASE: SECONDARY_BASE,
    MAX_GALLERY_THUMBS: MAX_GALLERY_THUMBS,
    latestDraft: latestDraft,
    resolvePrimary: resolvePrimary,
    buildGalleryPlan: buildGalleryPlan,
    buildHomePlan: buildHomePlan,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcHomeScreen = api;
}(typeof window !== "undefined" ? window : globalThis));
"use strict";

// Show library dashboard model for Podcast Design Canvas (#47).
//
// The first screen creators see: a library of shows and their past episodes. It keeps
// multiple podcast identities separated, surfaces each show's saved template/style
// identity, lists episodes with clear statuses, and lets the creator start a new episode
// prefilled with the show's template and speaker/style defaults — the foundation for
// repeatable production across episodes and clients.
//
// DOM-free on purpose, so the same rules drive the screen and the tests. Persistence is the
// UI layer's job (localStorage); this module only serializes/deserializes.
//
// Durable identity: new ids are derived from the EXISTING items (max + 1), never from an
// in-memory counter. That is deliberate — a counter reset on page reload must never let a
// freshly created show reuse an id like `show-1` and overwrite a saved show. Multiple shows
// stay separated across reloads. No build step, no dependencies.
(function (global) {
  // Clear, creator-facing episode statuses — no internal pipeline language.
  const EPISODE_STATUSES = [
    { key: "draft", label: "Draft" },
    { key: "in-progress", label: "In progress" },
    { key: "ready", label: "Ready to publish" },
    { key: "published", label: "Published" },
  ];

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function getStatus(key) {
    return EPISODE_STATUSES.find((status) => status.key === key) || EPISODE_STATUSES[0];
  }

  function createLibrary() {
    return { shows: [] };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // Parse the trailing integer from an id like "show-7" → 7. Ids without a numeric suffix
  // count as 0 so they never block a fresh id from being allocated.
  function idNumber(id, prefix) {
    const str = typeof id === "string" ? id : "";
    const match = str.match(new RegExp("^" + prefix + "-(\\d+)$"));
    return match ? parseInt(match[1], 10) : 0;
  }

  // The durable next id: max(existing) + 1, computed from the items themselves. Because it
  // reads the persisted set rather than a module counter, it is correct immediately after a
  // reload — the core fix that keeps shows from colliding/overwriting each other.
  function nextId(items, prefix) {
    const list = Array.isArray(items) ? items : [];
    const max = list.reduce((acc, item) => Math.max(acc, idNumber(item && item.id, prefix)), 0);
    return `${prefix}-${max + 1}`;
  }

  function normalizeSpeakerDefaults(speakers) {
    const list = Array.isArray(speakers) ? speakers : [];
    return list
      .map((speaker) => ({ role: trim(speaker && speaker.role), name: trim(speaker && speaker.name) }))
      .filter((speaker) => speaker.role || speaker.name);
  }

  function normalizeStyleSelection(selection) {
    if (!selection || typeof selection !== "object") {
      return null;
    }
    return {
      presetId: selection.presetId || null,
      layout: selection.layout || null,
      pacing: selection.pacing || null,
    };
  }

  // A show name must be present and unique within the library so identities stay distinct.
  function validateShowName(library, name, excludeId) {
    const trimmed = trim(name);
    if (!trimmed) {
      return { ok: false, error: "Give your show a name." };
    }
    const shows = library && Array.isArray(library.shows) ? library.shows : [];
    const duplicate = shows.find(
      (show) => trim(show.name).toLowerCase() === trimmed.toLowerCase() && show.id !== excludeId,
    );
    if (duplicate) {
      return { ok: false, error: "A show with that name already exists." };
    }
    return { ok: true, name: trimmed };
  }

  // Build a new show. The id is derived from the current library, so it is unique even right
  // after the library was rehydrated from storage. `options` seeds the show's identity.
  function createShow(library, name, options) {
    const opts = options && typeof options === "object" ? options : {};
    const shows = library && Array.isArray(library.shows) ? library.shows : [];
    return {
      id: nextId(shows, "show"),
      name: trim(name),
      createdAt: typeof opts.createdAt === "number" ? opts.createdAt : 0,
      templateId: opts.templateId || null,
      presetName: trim(opts.presetName),
      accent: trim(opts.accent),
      styleSelection: normalizeStyleSelection(opts.styleSelection),
      speakerDefaults: normalizeSpeakerDefaults(opts.speakerDefaults),
      episodes: [],
    };
  }

  function getShow(library, id) {
    const shows = library && Array.isArray(library.shows) ? library.shows : [];
    const found = shows.find((show) => show.id === id);
    return found ? clone(found) : null;
  }

  // Upsert a show by id, returning a NEW library sorted by name. Matching the template
  // store's immutable style so callers reassign the returned value.
  function saveShow(library, show) {
    const next = createLibrary();
    const existing = library && Array.isArray(library.shows) ? library.shows : [];
    next.shows = existing.slice();
    const index = next.shows.findIndex((item) => item.id === show.id);
    if (index >= 0) {
      next.shows[index] = clone(show);
    } else {
      next.shows.push(clone(show));
    }
    next.shows.sort((a, b) => trim(a.name).localeCompare(trim(b.name)));
    return next;
  }

  function removeShow(library, id) {
    const next = createLibrary();
    const existing = library && Array.isArray(library.shows) ? library.shows : [];
    next.shows = existing.filter((show) => show.id !== id);
    return next;
  }

  // A new episode within a show. Its id is derived from the show's existing episodes, so
  // episodes never collide within a show either, including after a reload.
  function createEpisode(show, name, options) {
    const opts = options && typeof options === "object" ? options : {};
    const episodes = show && Array.isArray(show.episodes) ? show.episodes : [];
    return {
      id: nextId(episodes, "ep"),
      name: trim(name) || "Untitled episode",
      status: getStatus(opts.status).key,
      updatedAt: typeof opts.updatedAt === "number" ? opts.updatedAt : 0,
    };
  }

  function addEpisode(library, showId, episode) {
    const show = getShow(library, showId);
    if (!show || !episode) {
      return library;
    }
    show.episodes = (Array.isArray(show.episodes) ? show.episodes : []).slice();
    show.episodes.push(clone(episode));
    return saveShow(library, show);
  }

  function updateEpisodeStatus(library, showId, episodeId, status, updatedAt) {
    const show = getShow(library, showId);
    if (!show) {
      return library;
    }
    const episodes = Array.isArray(show.episodes) ? show.episodes : [];
    const episode = episodes.find((item) => item.id === episodeId);
    if (!episode) {
      return library;
    }
    episode.status = getStatus(status).key;
    if (typeof updatedAt === "number") {
      episode.updatedAt = updatedAt;
    }
    return saveShow(library, show);
  }

  // The prefill a new episode inherits from its show: name plus the show's template, style
  // selection, and recurring speaker defaults. This is what makes repeat production fast —
  // the creator starts from the show's identity, not a blank setup.
  function startEpisodeFromShow(show, episodeName) {
    const source = show && typeof show === "object" ? show : {};
    return {
      showId: source.id || null,
      showName: trim(source.name),
      episodeName: trim(episodeName),
      templateId: source.templateId || null,
      styleSelection: normalizeStyleSelection(source.styleSelection),
      speakers: normalizeSpeakerDefaults(source.speakerDefaults),
    };
  }

  // The per-show rows the dashboard renders: identity plus episode counts by status.
  function listShows(library) {
    const shows = library && Array.isArray(library.shows) ? library.shows : [];
    return shows.map((show) => {
      const episodes = Array.isArray(show.episodes) ? show.episodes : [];
      const statusCounts = {};
      EPISODE_STATUSES.forEach((status) => {
        statusCounts[status.key] = 0;
      });
      episodes.forEach((episode) => {
        statusCounts[getStatus(episode.status).key] += 1;
      });
      return {
        id: show.id,
        name: trim(show.name),
        templateId: show.templateId || null,
        presetName: trim(show.presetName),
        accent: trim(show.accent),
        speakerCount: normalizeSpeakerDefaults(show.speakerDefaults).length,
        episodeCount: episodes.length,
        publishedCount: statusCounts.published,
        statusCounts,
      };
    });
  }

  function summarizeLibrary(library) {
    const shows = library && Array.isArray(library.shows) ? library.shows : [];
    let episodeCount = 0;
    let publishedCount = 0;
    shows.forEach((show) => {
      const episodes = Array.isArray(show.episodes) ? show.episodes : [];
      episodeCount += episodes.length;
      episodes.forEach((episode) => {
        if (getStatus(episode.status).key === "published") {
          publishedCount += 1;
        }
      });
    });
    return { showCount: shows.length, episodeCount, publishedCount };
  }

  function serializeLibrary(library) {
    return JSON.stringify(library && Array.isArray(library.shows) ? library : createLibrary());
  }

  // Rehydrate a library from storage. Every show/episode is normalized so ids stay parseable
  // and `episodes` is always an array; an empty id is reassigned a durable one. Because
  // nextId reads the data, no counter needs to be restored — creating shows after this is safe.
  function deserializeLibrary(json) {
    if (!json) {
      return createLibrary();
    }
    try {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.shows)) {
        return createLibrary();
      }
      const shows = parsed.shows
        .filter((show) => show && typeof show === "object")
        .map((show) => ({
          id: typeof show.id === "string" ? show.id : "",
          name: trim(show.name),
          createdAt: typeof show.createdAt === "number" ? show.createdAt : 0,
          templateId: show.templateId || null,
          presetName: trim(show.presetName),
          accent: trim(show.accent),
          styleSelection: normalizeStyleSelection(show.styleSelection),
          speakerDefaults: normalizeSpeakerDefaults(show.speakerDefaults),
          episodes: (Array.isArray(show.episodes) ? show.episodes : [])
            .filter((episode) => episode && typeof episode === "object")
            .map((episode) => ({
              id: typeof episode.id === "string" ? episode.id : "",
              name: trim(episode.name) || "Untitled episode",
              status: getStatus(episode.status).key,
              updatedAt: typeof episode.updatedAt === "number" ? episode.updatedAt : 0,
            })),
        }));
      // Heal any missing ids so later id derivation and lookups stay unambiguous.
      shows.forEach((show, index) => {
        if (!show.id) {
          show.id = nextId(shows.slice(0, index), "show");
        }
        show.episodes.forEach((episode, episodeIndex) => {
          if (!episode.id) {
            episode.id = nextId(show.episodes.slice(0, episodeIndex), "ep");
          }
        });
      });
      return { shows };
    } catch (err) {
      return createLibrary();
    }
  }

  const api = {
    EPISODE_STATUSES,
    getStatus,
    createLibrary,
    nextId,
    validateShowName,
    createShow,
    getShow,
    saveShow,
    removeShow,
    createEpisode,
    addEpisode,
    updateEpisodeStatus,
    startEpisodeFromShow,
    listShows,
    summarizeLibrary,
    serializeLibrary,
    deserializeLibrary,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcShowLibrary = api;
}(typeof window !== "undefined" ? window : globalThis));

"use strict";

// Show library dashboard model for Podcast Design Canvas (#47).
//
// Organizes multiple podcast shows and their episodes so repeat creators and agencies
// can keep identities separated, see episode status at a glance, and start new episodes
// from a saved show template. DOM-free — persistence is handled by the UI layer.
(function (global) {
  let showCounter = 0;
  let episodeCounter = 0;

  const EPISODE_STATUS = {
    draft: { id: "draft", label: "In setup" },
    in_production: { id: "in_production", label: "In production" },
    exported: { id: "exported", label: "Exported" },
  };

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createLibrary() {
    return { shows: [], episodes: [] };
  }

  function counterValueForId(id, prefix) {
    const match = new RegExp(`^${prefix}-(\\d+)$`).exec(trim(id));
    return match ? Number(match[1]) : 0;
  }

  function hydrateCounters(library) {
    const shows = library && Array.isArray(library.shows) ? library.shows : [];
    const episodes = library && Array.isArray(library.episodes) ? library.episodes : [];

    shows.forEach((show) => {
      showCounter = Math.max(showCounter, counterValueForId(show && show.id, "show"));
    });
    episodes.forEach((episode) => {
      episodeCounter = Math.max(episodeCounter, counterValueForId(episode && episode.id, "ep"));
    });
  }

  function validateShowName(library, name, excludeId) {
    const trimmed = trim(name);
    if (!trimmed) {
      return { ok: false, error: "Give your show a name." };
    }
    const shows = library && Array.isArray(library.shows) ? library.shows : [];
    const duplicate = shows.find(
      (show) => show.name.toLowerCase() === trimmed.toLowerCase() && show.id !== excludeId,
    );
    if (duplicate) {
      return { ok: false, error: "A show with that name already exists." };
    }
    return { ok: true, name: trimmed };
  }

  function createShow(name, options) {
    const opts = options || {};
    if (opts.id) {
      showCounter = Math.max(showCounter, counterValueForId(opts.id, "show"));
    } else {
      showCounter += 1;
    }
    return {
      id: opts.id || `show-${showCounter}`,
      name: trim(name),
      templateId: opts.templateId || "",
      createdAt: Date.now(),
    };
  }

  function createEpisode(showId, episodeName, options) {
    const opts = options || {};
    if (opts.id) {
      episodeCounter = Math.max(episodeCounter, counterValueForId(opts.id, "ep"));
    } else {
      episodeCounter += 1;
    }
    return {
      id: opts.id || `ep-${episodeCounter}`,
      showId: showId,
      episodeName: trim(episodeName) || "Untitled episode",
      status: opts.status || EPISODE_STATUS.draft.id,
      updatedAt: Date.now(),
      exportFileName: opts.exportFileName || "",
    };
  }

  function listShows(library) {
    const shows = library && Array.isArray(library.shows) ? library.shows : [];
    return shows
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((show) => ({
        id: show.id,
        name: show.name,
        templateId: show.templateId || "",
        createdAt: show.createdAt,
        episodeCount: countEpisodes(library, show.id),
      }));
  }

  function getShow(library, showId) {
    const shows = library && Array.isArray(library.shows) ? library.shows : [];
    return shows.find((show) => show.id === showId) || null;
  }

  function saveShow(library, show) {
    const next = createLibrary();
    next.shows = (library && Array.isArray(library.shows) ? library.shows : []).slice();
    next.episodes = (library && Array.isArray(library.episodes) ? library.episodes : []).slice();
    const index = next.shows.findIndex((item) => item.id === show.id);
    if (index >= 0) {
      next.shows[index] = clone(show);
    } else {
      next.shows.push(clone(show));
    }
    next.shows.sort((a, b) => a.name.localeCompare(b.name));
    return next;
  }

  function countEpisodes(library, showId) {
    return listEpisodes(library, showId).length;
  }

  function listEpisodes(library, showId) {
    const episodes = library && Array.isArray(library.episodes) ? library.episodes : [];
    return episodes
      .filter((episode) => episode.showId === showId)
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((episode) => summarizeEpisode(episode));
  }

  function getEpisode(library, episodeId) {
    const episodes = library && Array.isArray(library.episodes) ? library.episodes : [];
    const found = episodes.find((episode) => episode.id === episodeId);
    return found ? summarizeEpisode(found) : null;
  }

  function summarizeEpisode(episode) {
    const status = EPISODE_STATUS[episode.status] || EPISODE_STATUS.draft;
    return {
      id: episode.id,
      showId: episode.showId,
      episodeName: episode.episodeName,
      status: episode.status,
      statusLabel: status.label,
      updatedAt: episode.updatedAt,
      exportFileName: episode.exportFileName || "",
    };
  }

  function saveEpisode(library, episode) {
    const next = createLibrary();
    next.shows = (library && Array.isArray(library.shows) ? library.shows : []).slice();
    next.episodes = (library && Array.isArray(library.episodes) ? library.episodes : []).slice();
    const record = Object.assign({}, episode, { updatedAt: Date.now() });
    const index = next.episodes.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      next.episodes[index] = record;
    } else {
      next.episodes.push(record);
    }
    return next;
  }

  function deriveEpisodeStatus(progress) {
    const meta = progress || {};
    if (meta.exportStatus === "ready") {
      return EPISODE_STATUS.exported.id;
    }
    if (meta.publishReviewApproved || meta.hasStyle || meta.hasAudio || meta.hasMoments) {
      return EPISODE_STATUS.in_production.id;
    }
    return EPISODE_STATUS.draft.id;
  }

  function syncEpisodeProgress(library, episodeId, episodeName, progress) {
    if (!episodeId) {
      return library;
    }
    const episodes = library && Array.isArray(library.episodes) ? library.episodes : [];
    const existing = episodes.find((episode) => episode.id === episodeId);
    if (!existing) {
      return library;
    }
    const nextEpisode = Object.assign({}, existing, {
      episodeName: trim(episodeName) || existing.episodeName,
      status: deriveEpisodeStatus(progress),
      exportFileName: progress && progress.exportDownloadName ? progress.exportDownloadName : existing.exportFileName,
      updatedAt: Date.now(),
    });
    return saveEpisode(library, nextEpisode);
  }

  function summarizeShow(library, showId, templateMeta) {
    const show = getShow(library, showId);
    if (!show) {
      return null;
    }
    const episodes = listEpisodes(library, showId);
    const meta = templateMeta || {};
    return {
      id: show.id,
      name: show.name,
      templateId: show.templateId || "",
      templateName: meta.name || "",
      presetName: meta.presetName || "",
      titleText: meta.titleText || "",
      episodeCount: episodes.length,
      exportedCount: episodes.filter((ep) => ep.status === EPISODE_STATUS.exported.id).length,
      episodes: episodes,
      identityLine: meta.name
        ? `${meta.name} · ${meta.presetName || "Custom preset"}`
        : "No saved template yet — customize a layout in the canvas editor.",
    };
  }

  function startEpisodeForShow(library, showId, episodeName) {
    const show = getShow(library, showId);
    if (!show) {
      return { ok: false, error: "Show not found." };
    }
    const episode = createEpisode(showId, episodeName);
    const nextLibrary = saveEpisode(library, episode);
    return {
      ok: true,
      library: nextLibrary,
      show: show,
      episode: summarizeEpisode(episode),
      templateId: show.templateId || "",
    };
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
      const library = { shows: parsed.shows, episodes: parsed.episodes };
      hydrateCounters(library);
      return library;
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
    createLibrary,
    validateShowName,
    createShow,
    createEpisode,
    listShows,
    getShow,
    saveShow,
    listEpisodes,
    getEpisode,
    saveEpisode,
    deriveEpisodeStatus,
    syncEpisodeProgress,
    summarizeShow,
    startEpisodeForShow,
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

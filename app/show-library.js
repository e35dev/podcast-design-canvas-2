"use strict";

// Show library model for Podcast Design Canvas (#47).
//
// Manages a library of shows and their episodes. Each show carries a template/style
// identity and speaker defaults. Episodes belong to a show and track their production
// status. DOM-free — persistence is handled by the UI layer (localStorage).
(function (global) {
  var showCounter = 0;
  var episodeCounter = 0;

  function templateApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./show-templates.js");
    }
    var g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcShowTemplates;
  }

  var EPISODE_STATUSES = [
    { id: "draft", label: "Draft", description: "Episode is being set up" },
    { id: "in-progress", label: "In progress", description: "Audio, style, or moments work underway" },
    { id: "review", label: "In review", description: "Awaiting publish review approval" },
    { id: "published", label: "Published", description: "Episode exported and ready" },
  ];

  function getStatus(id) {
    return EPISODE_STATUSES.find(function (s) { return s.id === id; }) || EPISODE_STATUSES[0];
  }

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function createLibrary() {
    return { shows: [], activeShowId: null };
  }

  function createShow(name, options) {
    showCounter += 1;
    var opts = options || {};
    return {
      id: opts.id || "show-" + showCounter,
      name: trim(name),
      createdAt: Date.now(),
      templateId: opts.templateId || null,
      speakerDefaults: opts.speakerDefaults || [],
      episodes: [],
    };
  }

  function validateShowName(library, name, excludeId) {
    var trimmed = trim(name);
    if (!trimmed) {
      return { ok: false, error: "Give your show a name." };
    }
    var shows = library && Array.isArray(library.shows) ? library.shows : [];
    var duplicate = shows.find(function (show) {
      return show.name.toLowerCase() === trimmed.toLowerCase() && show.id !== excludeId;
    });
    if (duplicate) {
      return { ok: false, error: "A show with that name already exists." };
    }
    return { ok: true, name: trimmed };
  }

  function saveShow(library, show) {
    var lib = library || createLibrary();
    var next = { shows: lib.shows.slice(), activeShowId: lib.activeShowId };
    var index = next.shows.findIndex(function (s) { return s.id === show.id; });
    if (index >= 0) {
      next.shows[index] = Object.assign({}, show, { episodes: (show.episodes || []).slice() });
    } else {
      next.shows.push(Object.assign({}, show, { episodes: (show.episodes || []).slice() }));
    }
    next.shows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return next;
  }

  function getShow(library, id) {
    var shows = library && Array.isArray(library.shows) ? library.shows : [];
    return shows.find(function (s) { return s.id === id; }) || null;
  }

  function listShows(library) {
    var shows = library && Array.isArray(library.shows) ? library.shows : [];
    return shows.map(function (show) {
      var episodeCount = Array.isArray(show.episodes) ? show.episodes.length : 0;
      return {
        id: show.id,
        name: show.name,
        templateId: show.templateId,
        episodeCount: episodeCount,
        speakerCount: Array.isArray(show.speakerDefaults) ? show.speakerDefaults.length : 0,
      };
    });
  }

  function createEpisode(name, options) {
    episodeCounter += 1;
    var opts = options || {};
    return {
      id: opts.id || "ep-" + episodeCounter,
      name: trim(name),
      createdAt: Date.now(),
      status: "draft",
    };
  }

  function addEpisode(library, showId, episode) {
    var lib = library || createLibrary();
    var next = { shows: lib.shows.map(function (s) { return Object.assign({}, s, { episodes: (s.episodes || []).slice() }); }), activeShowId: lib.activeShowId };
    var show = next.shows.find(function (s) { return s.id === showId; });
    if (!show) {
      return next;
    }
    show.episodes.push(Object.assign({}, episode));
    return next;
  }

  function updateEpisodeStatus(library, showId, episodeId, status) {
    var lib = library || createLibrary();
    var next = { shows: lib.shows.map(function (s) { return Object.assign({}, s, { episodes: (s.episodes || []).slice() }); }), activeShowId: lib.activeShowId };
    var show = next.shows.find(function (s) { return s.id === showId; });
    if (!show) {
      return next;
    }
    var ep = show.episodes.find(function (e) { return e.id === episodeId; });
    if (ep && getStatus(status).id === status) {
      ep.status = status;
    }
    return next;
  }

  function listEpisodes(library, showId) {
    var show = getShow(library, showId);
    if (!show) {
      return [];
    }
    var episodes = Array.isArray(show.episodes) ? show.episodes : [];
    return episodes.map(function (ep) {
      var status = getStatus(ep.status);
      return {
        id: ep.id,
        name: ep.name,
        createdAt: ep.createdAt,
        status: ep.status,
        statusLabel: status.label,
      };
    });
  }

  function showSummary(library, showId, templateStore) {
    var show = getShow(library, showId);
    if (!show) {
      return null;
    }
    var TM = templateApi();
    var templateName = "";
    if (show.templateId && TM && templateStore) {
      var tpl = TM.getTemplate(templateStore, show.templateId);
      if (tpl) {
        templateName = tpl.name;
      }
    }
    var episodes = Array.isArray(show.episodes) ? show.episodes : [];
    var published = episodes.filter(function (e) { return e.status === "published"; }).length;
    var inProgress = episodes.filter(function (e) { return e.status === "in-progress" || e.status === "review"; }).length;
    return {
      id: show.id,
      name: show.name,
      templateId: show.templateId,
      templateName: templateName,
      speakerDefaults: show.speakerDefaults || [],
      episodeCount: episodes.length,
      publishedCount: published,
      inProgressCount: inProgress,
      identityLine: templateName
        ? templateName + " template · " + (show.speakerDefaults || []).length + " default speaker" + ((show.speakerDefaults || []).length === 1 ? "" : "s")
        : "No template assigned yet",
    };
  }

  function updateShowTemplate(library, showId, templateId) {
    var lib = library || createLibrary();
    var next = { shows: lib.shows.map(function (s) { return Object.assign({}, s, { episodes: (s.episodes || []).slice() }); }), activeShowId: lib.activeShowId };
    var show = next.shows.find(function (s) { return s.id === showId; });
    if (show) {
      show.templateId = templateId;
    }
    return next;
  }

  function updateShowSpeakerDefaults(library, showId, speakers) {
    var lib = library || createLibrary();
    var next = { shows: lib.shows.map(function (s) { return Object.assign({}, s, { episodes: (s.episodes || []).slice() }); }), activeShowId: lib.activeShowId };
    var show = next.shows.find(function (s) { return s.id === showId; });
    if (show) {
      show.speakerDefaults = (speakers || []).slice();
    }
    return next;
  }

  function prefillDraftFromShow(show) {
    if (!show) {
      return null;
    }
    var defaults = Array.isArray(show.speakerDefaults) ? show.speakerDefaults : [];
    return {
      speakerDefaults: defaults.map(function (sp) {
        return { name: sp.name || "", role: sp.role || "" };
      }),
      templateId: show.templateId || null,
    };
  }

  function setActiveShow(library, showId) {
    var lib = library || createLibrary();
    return { shows: lib.shows.slice(), activeShowId: showId };
  }

  function serializeLibrary(library) {
    return JSON.stringify(library || createLibrary());
  }

  function deserializeLibrary(json) {
    if (!json) {
      return createLibrary();
    }
    try {
      var parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.shows)) {
        return createLibrary();
      }
      return { shows: parsed.shows, activeShowId: parsed.activeShowId || null };
    } catch (err) {
      return createLibrary();
    }
  }

  function _resetCounters() {
    showCounter = 0;
    episodeCounter = 0;
  }

  var api = {
    EPISODE_STATUSES: EPISODE_STATUSES,
    getStatus: getStatus,
    createLibrary: createLibrary,
    createShow: createShow,
    validateShowName: validateShowName,
    saveShow: saveShow,
    getShow: getShow,
    listShows: listShows,
    createEpisode: createEpisode,
    addEpisode: addEpisode,
    updateEpisodeStatus: updateEpisodeStatus,
    listEpisodes: listEpisodes,
    showSummary: showSummary,
    updateShowTemplate: updateShowTemplate,
    updateShowSpeakerDefaults: updateShowSpeakerDefaults,
    prefillDraftFromShow: prefillDraftFromShow,
    setActiveShow: setActiveShow,
    serializeLibrary: serializeLibrary,
    deserializeLibrary: deserializeLibrary,
    _resetCounters: _resetCounters,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcShowLibrary = api;
}(typeof window !== "undefined" ? window : globalThis));

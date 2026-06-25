"use strict";

// Visual moments editor model for Podcast Design Canvas (#19).
//
// The contextual editing layer that turns a long-form recording into a deliberately
// produced episode: a speaker-aware, transcript-style timeline where creators place
// captions, title moments, b-roll overlays, branded callouts, and overlay notes at key
// points, then preview how each moment changes the on-screen look. DOM-free on purpose so
// the same rules drive the screen and the tests. No build step, no dependencies.
(function (global) {
  // The moment treatments a creator can place across the episode. Each carries a creator
  // facing label and a description of how it reads on screen — no pipeline jargon.
  const MOMENT_TYPES = [
    {
      id: "caption",
      label: "Caption",
      defaultText: "Add a caption line",
      treatment: "Lower-third caption",
      onScreen: true,
    },
    {
      id: "title",
      label: "Title moment",
      defaultText: "Section title",
      treatment: "Full-width title card",
      onScreen: true,
    },
    {
      id: "broll",
      label: "B-roll overlay",
      defaultText: "Describe the b-roll footage",
      treatment: "B-roll fills the frame",
      onScreen: true,
    },
    {
      id: "callout",
      label: "Visual callout",
      defaultText: "Key point to highlight",
      treatment: "Highlighted callout badge",
      onScreen: true,
    },
    {
      id: "note",
      label: "Overlay note",
      defaultText: "Note for this moment",
      treatment: "Director note (off-screen)",
      onScreen: false,
    },
  ];

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getType(id) {
    return MOMENT_TYPES.find((type) => type.id === id) || MOMENT_TYPES[0];
  }

  function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
  }

  function formatTime(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds || 0));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${minutes}:${pad2(seconds)}`;
  }

  // Accept creator input like "1:30", "90", or "  2:05 " and normalize to "M:SS". Invalid
  // input clamps to 0:00 rather than throwing, so the timeline can never break.
  function parseTime(value) {
    if (typeof value === "number" && isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    const text = trim(value);
    if (!text) {
      return 0;
    }
    if (text.indexOf(":") >= 0) {
      const parts = text.split(":");
      const minutes = parseInt(parts[0], 10) || 0;
      const seconds = parseInt(parts[1], 10) || 0;
      return Math.max(0, minutes * 60 + Math.min(59, Math.max(0, seconds)));
    }
    const asSeconds = parseInt(text, 10);
    return isFinite(asSeconds) ? Math.max(0, asSeconds) : 0;
  }

  function normalizeTime(value) {
    return formatTime(parseTime(value));
  }

  // Build a speaker-aware, transcript-style scaffold for the full episode. Segments cycle
  // through the real assigned speakers and are spaced evenly, giving creators meaningful
  // anchor points to attach moments to without a real transcript yet.
  function buildTranscript(episodeSummary, segmentCount) {
    const speakers = episodeSummary && Array.isArray(episodeSummary.speakers)
      ? episodeSummary.speakers
      : [];
    const count = typeof segmentCount === "number" && segmentCount > 0 ? segmentCount : 6;
    const spacingSeconds = 90;
    const segments = [];
    for (let i = 0; i < count; i += 1) {
      const speaker = speakers.length ? speakers[i % speakers.length] : null;
      segments.push({
        index: i,
        seconds: i * spacingSeconds,
        time: formatTime(i * spacingSeconds),
        speakerRole: (speaker && speaker.role) || "All speakers",
        speakerName: (speaker && speaker.name) || "Conversation",
      });
    }
    return segments;
  }

  function speakerOptions(episodeSummary) {
    const speakers = episodeSummary && Array.isArray(episodeSummary.speakers)
      ? episodeSummary.speakers
      : [];
    const options = [{ role: "All speakers", name: "All speakers" }];
    speakers.forEach((speaker) => {
      options.push({
        role: (speaker && speaker.role) || "Speaker",
        name: (speaker && speaker.name) || "Unnamed speaker",
      });
    });
    return options;
  }

  // A fresh moments board for an episode. Holds the transcript scaffold and the ordered
  // list of placed moments. `seq` keeps moment ids stable and unique within the board.
  function createBoard(episodeSummary) {
    const episode = episodeSummary || {};
    return {
      seq: 0,
      episodeName: trim(episode.episodeName),
      transcript: buildTranscript(episode),
      moments: [],
      suggestionState: {},
    };
  }

  function sortMoments(moments) {
    return moments
      .slice()
      .sort((a, b) => (a.seconds - b.seconds) || (a.order - b.order));
  }

  // Place a new moment of the given type. `opts` may set time, text, speaker, and an order
  // hint. Returns a new board with the moment inserted in timeline order.
  function addMoment(board, typeId, opts) {
    const base = board && typeof board === "object" ? board : createBoard({});
    const type = getType(typeId);
    const options = opts || {};
    const seq = (typeof base.seq === "number" ? base.seq : 0) + 1;
    const seconds = parseTime(options.time != null ? options.time : 0);
    const moment = {
      id: `moment-${seq}`,
      order: seq,
      type: type.id,
      typeLabel: type.label,
      text: trim(options.text) || type.defaultText,
      seconds,
      time: formatTime(seconds),
      speakerRole: trim(options.speakerRole) || "All speakers",
      speakerName: trim(options.speakerName) || "All speakers",
      visible: options.visible === false ? false : true,
    };
    const moments = sortMoments((Array.isArray(base.moments) ? base.moments : []).concat(moment));
    return Object.assign({}, base, { seq, moments });
  }

  function ensureString(value) {
    return trim(value);
  }

  // Build lightweight speaker context cards for suggestion ranking.
  function buildContextHints(episodeSummary, contextReview) {
    const speakers = episodeSummary && Array.isArray(episodeSummary.speakers)
      ? episodeSummary.speakers
      : [];
    const reviewEntries = contextReview && Array.isArray(contextReview.speakers)
      ? contextReview.speakers
      : [];
    const map = {};
    speakers.forEach((speaker) => {
      const key = (speaker && speaker.role) || "All speakers";
      map[key] = {
        role: key,
        name: ensureString(speaker && speaker.name) || key,
        brand: "",
        topics: ["topic", "example clip"],
        approved: false,
      };
    });
    reviewEntries.forEach((entry) => {
      const matchRole = entry && entry.role && map[entry.role];
      if (!matchRole) {
        return;
      }
      matchRole.brand = ensureString(entry.brand) || matchRole.brand;
      matchRole.topics = Array.isArray(entry.topics) && entry.topics.length ? entry.topics.slice(0, 3) : matchRole.topics;
      matchRole.approved = Boolean(entry.approved);
    });
    return map;
  }

  function speakerTermScore(speaker, segment, index) {
    const context = speaker || {};
    const base = [
      ensureString(context.name),
      ensureString(context.brand),
      ensureString(segment.speakerRole),
    ].filter(Boolean).join(" ");
    const topicList = Array.isArray(context.topics) && context.topics.length ? context.topics : ["episode moment"];
    const topic = topicList[index % topicList.length];
    const detail = base ? `${base} ${ensureString(topic)}` : ensureString(topic);
    return {
      text: `B-roll: ${detail || "Episode moment".trim()}`,
      reason: `A visual moment tied to ${context.role || "speaker"} speaking here helps orient this part of the story.`,
      term: ensureString(topic) || "episode concept",
      time: segment.time,
      speakerRole: segment.speakerRole,
      speakerName: segment.speakerName,
    };
  }

  function uniqueKeySuggestion(prefix, suggestion) {
    return `${prefix}-${ensureString(suggestion.time)}-${ensureString(suggestion.speakerRole)}-${ensureString(suggestion.text)}`
      .toLowerCase()
      .replace(/[^\w\-:]+/g, "-")
      .replace(/-+/g, "-");
  }

  // Uses the transcript scaffold + context review to make creator-facing, deterministic
  // b-roll suggestions. Output is stable and auditable for tests and review.
  function generateBrollSuggestions(episodeSummary, momentsBoard, contextReview, options) {
    const board = momentsBoard && typeof momentsBoard === "object" ? momentsBoard : createBoard(episodeSummary);
    const transcript = board.transcript || [];
    const hints = buildContextHints(episodeSummary || {}, contextReview);
    const maxItems = options && options.maxItems > 0 ? options.maxItems : 5;
    const suggestions = [];
    transcript.forEach((segment, index) => {
      const hint = hints[segment.speakerRole] || {};
      const seed = speakerTermScore(hint, segment, index);
      const id = uniqueKeySuggestion("broll", seed);
      const alreadyHandled = board && board.suggestionState && board.suggestionState[id] && board.suggestionState[id].status;
      if (alreadyHandled) {
        return;
      }
      const suggestion = {
        id,
        time: seed.time,
        type: "broll",
        speakerRole: seed.speakerRole,
        speakerName: seed.speakerName,
        text: seed.text,
        reason: seed.reason,
        relevance: hint.approved || false ? "social" : "transcript",
        term: seed.term,
      };
      suggestions.push(suggestion);
    });
    return suggestions.slice(0, maxItems);
  }

  function suggestionExists(board, suggestion) {
    return listMoments(board).some((moment) => (
      moment.type === "broll"
      && moment.metadata
      && moment.metadata.suggestionId === suggestion.id
    ));
  }

  function acceptBrollSuggestion(board, suggestion) {
    const base = board && typeof board === "object" ? board : createBoard({});
    const next = base.suggestionState && typeof base.suggestionState === "object"
      ? clone(base.suggestionState)
      : {};
    const reason = suggestion && suggestion.id ? suggestion.id : uniqueKeySuggestion("broll", suggestion || {});
    if (next[reason] && next[reason].status === "accepted") {
      return {
        board: base,
        moment: null,
        suggestionId: reason,
      };
    }
    if (!suggestion) {
      return {
        board: base,
        moment: null,
        suggestionId: reason,
      };
    }
    next[reason] = { status: "accepted", text: suggestion.text };
    if (suggestionExists(base, suggestion)) {
      return {
        board: Object.assign({}, base, { suggestionState: next }),
        moment: null,
        suggestionId: reason,
      };
    }
    const withMoments = addMoment(base, "broll", {
      time: suggestion.time,
      text: suggestion.text,
      speakerRole: suggestion.speakerRole,
      speakerName: suggestion.speakerName,
      visible: true,
    });
    const moments = Array.isArray(withMoments.moments) ? withMoments.moments.slice() : [];
    const added = moments
      .filter((moment) => moment.type === "broll")
      .sort((a, b) => (a.seconds - b.seconds) || (a.order - b.order))
      .find((moment) => (moment.metadata && moment.metadata.suggestionId === reason))
      || moments.find((moment) => moment.type === "broll" && moment.text === suggestion.text);
    if (added) {
      added.metadata = Object.assign({}, added.metadata, {
        suggestionId: reason,
        suggestionText: ensureString(suggestion.reason),
        suggestionTerm: ensureString(suggestion.term),
      });
      const normalized = Object.assign({}, withMoments, {
        moments: sortMoments(moments),
        suggestionState: next,
      });
      return {
        board: normalized,
        moment: added,
        suggestionId: reason,
      };
    }
    const marked = Object.assign({}, withMoments, { suggestionState: next });
    return {
      board: marked,
      moment: null,
      suggestionId: reason,
    };
  }

  function filterPendingSuggestions(board, suggestions) {
    return Array.isArray(suggestions)
      ? suggestions.filter((suggestion) => listSuggestionStatus(board, suggestion) === "pending")
      : [];
  }

  function setSuggestionStatus(board, suggestion, status) {
    const base = board && typeof board === "object" ? board : createBoard({});
    const next = base.suggestionState && typeof base.suggestionState === "object"
      ? clone(base.suggestionState)
      : {};
    const reason = suggestion && suggestion.id ? suggestion.id : uniqueKeySuggestion("broll", suggestion || {});
    next[reason] = { status, text: suggestion && suggestion.text ? suggestion.text : "" };
    return Object.assign({}, base, { suggestionState: next });
  }

  function skipBrollSuggestion(board, suggestion) {
    return setSuggestionStatus(board, suggestion, "skipped");
  }

  function listSuggestionStatus(board, suggestion) {
    const id = suggestion && suggestion.id ? suggestion.id : "";
    const base = board && board.suggestionState && board.suggestionState[id];
    return base ? base.status : "pending";
  }

  // Immutable edit of a single moment's timing, text, speaker, or visibility. Re-sorts when
  // timing changes so the timeline always reads top-to-bottom in episode order.
  function updateMoment(board, id, patch) {
    const base = board && typeof board === "object" ? board : createBoard({});
    const changes = patch || {};
    const moments = (Array.isArray(base.moments) ? base.moments : []).map((moment) => {
      if (moment.id !== id) {
        return moment;
      }
      const next = Object.assign({}, moment);
      if (changes.text != null) {
        next.text = trim(changes.text);
      }
      if (changes.time != null) {
        next.seconds = parseTime(changes.time);
        next.time = formatTime(next.seconds);
      }
      if (changes.speakerRole != null) {
        next.speakerRole = trim(changes.speakerRole) || "All speakers";
      }
      if (changes.speakerName != null) {
        next.speakerName = trim(changes.speakerName) || "All speakers";
      }
      if (changes.visible != null) {
        next.visible = Boolean(changes.visible);
      }
      return next;
    });
    return Object.assign({}, base, { moments: sortMoments(moments) });
  }

  function toggleMoment(board, id) {
    const moment = getMoment(board, id);
    return updateMoment(board, id, { visible: !(moment && moment.visible) });
  }

  function removeMoment(board, id) {
    const base = board && typeof board === "object" ? board : createBoard({});
    const moments = (Array.isArray(base.moments) ? base.moments : []).filter(
      (moment) => moment.id !== id,
    );
    return Object.assign({}, base, { moments });
  }

  function getMoment(board, id) {
    const moments = board && Array.isArray(board.moments) ? board.moments : [];
    return moments.find((moment) => moment.id === id) || null;
  }

  function listMoments(board) {
    return board && Array.isArray(board.moments) ? sortMoments(board.moments) : [];
  }

  // How a single moment reads on the episode look — used by the editor's live preview so
  // creators see the effect of a moment before committing to it.
  function previewMoment(board, id) {
    const moment = getMoment(board, id);
    if (!moment) {
      return null;
    }
    const type = getType(moment.type);
    const speakerLabel = moment.speakerRole === "All speakers"
      ? "the whole conversation"
      : `${moment.speakerRole}${moment.speakerName && moment.speakerName !== moment.speakerRole ? ` (${moment.speakerName})` : ""}`;
    return {
      id: moment.id,
      type: moment.type,
      typeLabel: type.label,
      treatment: type.treatment,
      onScreen: type.onScreen,
      time: moment.time,
      text: moment.text,
      speakerLabel,
      visible: moment.visible,
      effect: moment.visible
        ? `${type.treatment} over ${speakerLabel} at ${moment.time}.`
        : `${type.label} hidden — it will not appear in the episode.`,
    };
  }

  function countsByType(board) {
    const counts = {};
    MOMENT_TYPES.forEach((type) => {
      counts[type.id] = 0;
    });
    listMoments(board).forEach((moment) => {
      counts[moment.type] = (counts[moment.type] || 0) + 1;
    });
    return counts;
  }

  function summarizeBoard(board) {
    const moments = listMoments(board);
    const visible = moments.filter((moment) => moment.visible);
    const counts = countsByType(board);
    const lines = MOMENT_TYPES
      .filter((type) => counts[type.id] > 0)
      .map((type) => `${type.label}: ${counts[type.id]}`);
    return {
      total: moments.length,
      visibleCount: visible.length,
      counts,
      lines,
      reviewLine: moments.length
        ? `Visual moments: ${visible.length} of ${moments.length} live${lines.length ? ` (${lines.join(", ")})` : ""}`
        : "",
    };
  }

  // Persistence is handled by the UI (localStorage); these mirror the show-template store.
  function serializeBoard(board) {
    return JSON.stringify(board || createBoard({}));
  }

  function deserializeBoard(json, episodeSummary) {
    if (!json) {
      return createBoard(episodeSummary || {});
    }
    try {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.moments)) {
        return createBoard(episodeSummary || {});
      }
      // Refresh the transcript scaffold from the current episode while keeping moments.
      const board = createBoard(episodeSummary || { episodeName: parsed.episodeName });
      board.seq = typeof parsed.seq === "number" ? parsed.seq : parsed.moments.length;
      board.suggestionState = parsed.suggestionState && typeof parsed.suggestionState === "object"
        ? parsed.suggestionState
        : {};
      board.moments = sortMoments(parsed.moments.map((moment) => clone(moment)));
      return board;
    } catch (err) {
      return createBoard(episodeSummary || {});
    }
  }

  const api = {
    MOMENT_TYPES,
    getType,
    formatTime,
    parseTime,
    normalizeTime,
    buildTranscript,
    buildContextHints,
    speakerOptions,
    createBoard,
    generateBrollSuggestions,
    acceptBrollSuggestion,
    skipBrollSuggestion,
    filterPendingSuggestions,
    listSuggestionStatus,
    addMoment,
    updateMoment,
    toggleMoment,
    removeMoment,
    getMoment,
    listMoments,
    previewMoment,
    countsByType,
    summarizeBoard,
    serializeBoard,
    deserializeBoard,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcVisualMoments = api;
}(typeof window !== "undefined" ? window : globalThis));

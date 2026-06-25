"use strict";

// Smart b-roll suggestions for Podcast Design Canvas (#67).
//
// Uses transcript scaffold, social context, and caption corrections to propose contextual
// b-roll moments. Creators accept or skip each suggestion; accepted items become b-roll
// overlays in the visual moments board and flow through review and export. DOM-free.
(function (global) {
  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function socialContextApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./social-context.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcSocialContext;
  }

  function momentsApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./visual-moments.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcVisualMoments;
  }

  function correctionApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./transcript-correction.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcTranscriptCorrection;
  }

  function speakerLabelFromCorrection(correctionReview, role) {
    if (!correctionReview || !Array.isArray(correctionReview.speakers)) {
      return null;
    }
    const speaker = correctionReview.speakers.find((entry) => entry.role === role);
    return speaker ? speaker.label : null;
  }

  function speakerContextForSegment(contextReview, episodeSummary, segment) {
    const SC = socialContextApi();
    if (contextReview && contextReview.approved && SC) {
      const ctx = SC.findSpeakerContext(contextReview, segment.speakerRole, segment.speakerName);
      if (ctx) {
        return {
          displayName: ctx.displayName,
          brand: ctx.brand || "",
          topics: Array.isArray(ctx.topics) ? ctx.topics.slice() : [],
        };
      }
    }
    const speakers = episodeSummary && Array.isArray(episodeSummary.speakers)
      ? episodeSummary.speakers
      : [];
    const match = speakers.find((speaker) => speaker.role === segment.speakerRole)
      || speakers.find((speaker) => speaker.name === segment.speakerName);
    if (match && SC) {
      const derived = SC.deriveSpeakerContext(match);
      return {
        displayName: derived.displayName,
        brand: derived.brand || "",
        topics: derived.topics || [],
      };
    }
    return {
      displayName: segment.speakerName || segment.speakerRole,
      brand: "",
      topics: [],
    };
  }

  function topicTermsFromCorrection(correctionReview, role) {
    if (!correctionReview || !Array.isArray(correctionReview.speakers)) {
      return [];
    }
    const speaker = correctionReview.speakers.find((entry) => entry.role === role);
    return speaker && Array.isArray(speaker.topicTerms) ? speaker.topicTerms.slice() : [];
  }

  function brandFromCorrection(correctionReview, role) {
    if (!correctionReview || !Array.isArray(correctionReview.speakers)) {
      return "";
    }
    const speaker = correctionReview.speakers.find((entry) => entry.role === role);
    return speaker ? trim(speaker.brand) : "";
  }

  function parseSeconds(time) {
    const VM = momentsApi();
    return VM ? VM.parseTime(time) : 0;
  }

  function formatTime(seconds) {
    const VM = momentsApi();
    return VM ? VM.formatTime(seconds) : "0:00";
  }

  function hasBrollNear(board, seconds, windowSeconds) {
    const VM = momentsApi();
    const window = typeof windowSeconds === "number" ? windowSeconds : 25;
    const moments = VM ? VM.listMoments(board) : (board && board.moments) || [];
    return moments.some((moment) => {
      if (moment.type !== "broll" || moment.visible === false) {
        return false;
      }
      return Math.abs((moment.seconds || 0) - seconds) <= window;
    });
  }

  function buildSuggestionCopy(segment, speakerContext, correctionReview) {
    const correctedName = speakerLabelFromCorrection(correctionReview, segment.speakerRole);
    const displayName = correctedName || speakerContext.displayName || segment.speakerName;
    const brand = brandFromCorrection(correctionReview, segment.speakerRole) || speakerContext.brand;
    const topics = topicTermsFromCorrection(correctionReview, segment.speakerRole);
    const topicList = topics.length ? topics : (speakerContext.topics || []);

    if (brand) {
      return {
        text: `${brand} logo or product screen capture`,
        rationale: `${displayName} is tied to ${brand} — show the brand on screen while they speak at ${segment.time}.`,
        source: "brand",
        assetKind: "logo",
      };
    }
    if (topicList.length) {
      const topic = topicList[0];
      return {
        text: `Topic card: ${topic}`,
        rationale: `This segment covers ${topic} — a topic card helps viewers follow the conversation at ${segment.time}.`,
        source: "topic",
        assetKind: "topic-card",
      };
    }
    if (segment.speakerRole === "Host") {
      return {
        text: `${displayName} studio or show b-roll`,
        rationale: `Introduce ${displayName}'s show visually while the host sets context at ${segment.time}.`,
        source: "transcript-segment",
        assetKind: "screen-capture",
      };
    }
    return {
      text: `${displayName} — supporting cutaway footage`,
      rationale: `Cover this ${segment.speakerRole} segment with relevant visuals at ${segment.time}.`,
      source: "transcript-segment",
      assetKind: "image",
    };
  }

  function buildSuggestions(episodeSummary, options) {
    const opts = options || {};
    const board = opts.momentsBoard || {};
    const transcript = Array.isArray(board.transcript) ? board.transcript : [];
    const VM = momentsApi();
    const segments = transcript.length
      ? transcript
      : (VM ? VM.buildTranscript(episodeSummary) : []);

    const suggestions = [];
    let seq = 0;

    segments.forEach((segment, index) => {
      if (index % 2 !== 0 && segments.length > 2) {
        return;
      }
      const speakerContext = speakerContextForSegment(opts.contextReview, episodeSummary, segment);
      const hasSignal = speakerContext.brand
        || (speakerContext.topics && speakerContext.topics.length)
        || opts.contextReview
        || index === 0;
      if (!hasSignal) {
        return;
      }

      const offsetSeconds = (segment.seconds || parseSeconds(segment.time)) + 15;
      if (hasBrollNear(board, offsetSeconds)) {
        return;
      }

      const copy = buildSuggestionCopy(segment, speakerContext, opts.correctionReview);
      const correctedName = speakerLabelFromCorrection(opts.correctionReview, segment.speakerRole);
      seq += 1;
      suggestions.push({
        id: `broll-suggestion-${seq}`,
        time: formatTime(offsetSeconds),
        seconds: offsetSeconds,
        text: copy.text,
        rationale: copy.rationale,
        speakerRole: segment.speakerRole,
        speakerName: correctedName || segment.speakerName,
        source: copy.source,
        assetKind: copy.assetKind,
        transcriptIndex: segment.index != null ? segment.index : index,
        status: "pending",
        appliedMomentId: null,
      });
    });

    return suggestions;
  }

  function createSuggestionsReview(episodeSummary, options) {
    const opts = options || {};
    return {
      episodeName: trim(episodeSummary && episodeSummary.episodeName),
      approved: false,
      contextApproved: Boolean(opts.contextReview && opts.contextReview.approved),
      correctionApproved: Boolean(opts.correctionReview && opts.correctionReview.approved),
      suggestions: buildSuggestions(episodeSummary, opts),
    };
  }

  function findSuggestion(review, id) {
    const suggestions = review && Array.isArray(review.suggestions) ? review.suggestions : [];
    return suggestions.find((item) => item.id === id) || null;
  }

  function updateSuggestion(review, id, patch) {
    const next = clone(review || createSuggestionsReview({}, {}));
    next.suggestions = (next.suggestions || []).map((item) => {
      if (item.id !== id) {
        return item;
      }
      const updated = Object.assign({}, item, patch || {});
      if (patch && patch.text != null) {
        updated.text = trim(patch.text);
      }
      if (patch && patch.time != null) {
        updated.seconds = parseSeconds(patch.time);
        updated.time = formatTime(updated.seconds);
      }
      if (patch && patch.status != null) {
        updated.status = patch.status;
      }
      return updated;
    });
    next.approved = false;
    return next;
  }

  function acceptSuggestion(review, id) {
    return updateSuggestion(review, id, { status: "accepted" });
  }

  function dismissSuggestion(review, id) {
    return updateSuggestion(review, id, { status: "dismissed" });
  }

  function approveSuggestions(review) {
    const next = clone(review || createSuggestionsReview({}, {}));
    next.approved = true;
    return next;
  }

  function applyToMoments(board, review) {
    const VM = momentsApi();
    let nextBoard = clone(board || { moments: [], transcript: [] });
    const nextReview = clone(review || createSuggestionsReview({}, {}));
    if (!nextReview.approved || !VM) {
      return { board: nextBoard, review: nextReview };
    }

    nextReview.suggestions = (nextReview.suggestions || []).map((item) => {
      if (item.status !== "accepted") {
        return item;
      }
      if (item.appliedMomentId && VM.getMoment(nextBoard, item.appliedMomentId)) {
        return item;
      }
      if (hasBrollNear(nextBoard, item.seconds)) {
        return item;
      }
      nextBoard = VM.addMoment(nextBoard, "broll", {
        time: item.time,
        text: item.text,
        speakerRole: item.speakerRole,
        speakerName: item.speakerName,
      });
      const moments = VM.listMoments(nextBoard);
      const applied = moments[moments.length - 1];
      return Object.assign({}, item, {
        appliedMomentId: applied ? applied.id : item.appliedMomentId,
      });
    });

    return { board: nextBoard, review: nextReview };
  }

  function previewAcceptedSuggestions(board, review) {
    const VM = momentsApi();
    const accepted = (review && review.suggestions ? review.suggestions : [])
      .filter((item) => item.status === "accepted");
    return accepted.map((item) => {
      const moment = item.appliedMomentId && VM ? VM.getMoment(board, item.appliedMomentId) : null;
      const preview = moment && VM ? VM.previewMoment(board, moment.id) : null;
      return {
        suggestionId: item.id,
        time: item.time,
        text: item.text,
        rationale: item.rationale,
        assetKind: item.assetKind,
        momentId: item.appliedMomentId,
        previewLine: preview
          ? `${preview.typeLabel} at ${preview.time}: ${preview.text}`
          : `${item.text} at ${item.time}`,
      };
    });
  }

  function summarizeSuggestions(review) {
    const suggestions = review && Array.isArray(review.suggestions) ? review.suggestions : [];
    const accepted = suggestions.filter((item) => item.status === "accepted");
    const dismissed = suggestions.filter((item) => item.status === "dismissed");
    const pending = suggestions.filter((item) => item.status === "pending");
    const summaryLines = [];
    if (review && review.approved) {
      summaryLines.push(
        `B-roll suggestions: ${accepted.length} accepted${dismissed.length ? ` · ${dismissed.length} skipped` : ""}`,
      );
      if (accepted.length) {
        summaryLines.push(
          `Accepted b-roll: ${accepted.map((item) => `${item.text} (${item.time})`).join(" · ")}`,
        );
      }
    } else if (suggestions.length) {
      summaryLines.push(
        `B-roll suggestions: ${pending.length} pending · ${accepted.length} accepted · ${dismissed.length} skipped`,
      );
    }
    return {
      approved: Boolean(review && review.approved),
      total: suggestions.length,
      acceptedCount: accepted.length,
      dismissedCount: dismissed.length,
      pendingCount: pending.length,
      reviewLine: summaryLines.join(" · "),
      lines: summaryLines,
    };
  }

  function applySuggestionsReview(review, targets) {
    const t = targets || {};
    const applied = applyToMoments(t.momentsBoard, review);
    return {
      momentsBoard: applied.board,
      suggestionsReview: applied.review,
    };
  }

  function serializeSuggestions(review) {
    return JSON.stringify(review || null);
  }

  function deserializeSuggestions(json, episodeSummary, options) {
    if (!json) {
      return createSuggestionsReview(episodeSummary, options);
    }
    try {
      const parsed = typeof json === "string" ? JSON.parse(json) : json;
      if (!parsed || typeof parsed !== "object") {
        return createSuggestionsReview(episodeSummary, options);
      }
      const base = createSuggestionsReview(episodeSummary, options);
      return Object.assign(base, parsed, {
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : base.suggestions,
      });
    } catch (err) {
      return createSuggestionsReview(episodeSummary, options);
    }
  }

  const api = {
    createSuggestionsReview,
    buildSuggestions,
    updateSuggestion,
    acceptSuggestion,
    dismissSuggestion,
    approveSuggestions,
    applyToMoments,
    previewAcceptedSuggestions,
    summarizeSuggestions,
    applySuggestionsReview,
    serializeSuggestions,
    deserializeSuggestions,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcBrollSuggestions = api;
}(typeof window !== "undefined" ? window : globalThis));

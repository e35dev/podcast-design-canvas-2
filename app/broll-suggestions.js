"use strict";

// Smart b-roll suggestions for Podcast Design Canvas (#67).
//
// Uses transcript lines, caption corrections, and speaker social context to propose
// relevant b-roll moments creators can accept or skip. Accepted suggestions become
// b-roll visual moments in the existing review/export flow. DOM-free for tests and UI.
(function (global) {
  const STATUS = {
    PENDING: "pending",
    ACCEPTED: "accepted",
    SKIPPED: "skipped",
  };

  const ASSET_TYPES = {
    LOGO: "logo",
    PRODUCT: "product",
    TOPIC: "topic-card",
    SCREEN: "screen-capture",
  };

  let suggestionCounter = 0;

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function momentsApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./visual-moments.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcVisualMoments;
  }

  function parseCounterFromId(id, prefix) {
    if (typeof id !== "string") {
      return 0;
    }
    const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? parseInt(match[1], 10) : 0;
  }

  function hydrateCounter(session) {
    const list = session && Array.isArray(session.suggestions) ? session.suggestions : [];
    let max = 0;
    list.forEach((item) => {
      max = Math.max(max, parseCounterFromId(item.id, "broll"));
    });
    suggestionCounter = Math.max(suggestionCounter, max);
  }

  function createSession(episodeSummary) {
    return {
      episodeName: trim(episodeSummary && episodeSummary.episodeName),
      generated: false,
      suggestions: [],
    };
  }

  function speakerByRole(review, role) {
    const speakers = review && Array.isArray(review.speakers) ? review.speakers : [];
    return speakers.find((speaker) => speaker.role === role) || null;
  }

  function nextId() {
    suggestionCounter += 1;
    return `broll-${suggestionCounter}`;
  }

  function buildReason(assetType, speakerLabel, detail) {
    const who = speakerLabel || "the speaker";
    if (assetType === ASSET_TYPES.LOGO) {
      return `${who} references ${detail} — show the brand logo while that moment plays.`;
    }
    if (assetType === ASSET_TYPES.PRODUCT) {
      return `${who} talks about ${detail} — add a product visual so viewers see what they mean.`;
    }
    if (assetType === ASSET_TYPES.TOPIC) {
      return `This segment covers ${detail} — a topic card helps viewers follow the conversation.`;
    }
    return `${who} mentions ${detail} — a supporting visual keeps the edit feeling intentional.`;
  }

  function momentTextFor(assetType, detail) {
    if (assetType === ASSET_TYPES.LOGO) {
      return `${detail} logo`;
    }
    if (assetType === ASSET_TYPES.PRODUCT) {
      return `${detail} product shot`;
    }
    if (assetType === ASSET_TYPES.TOPIC) {
      return `Topic: ${detail}`;
    }
    return `${detail} reference`;
  }

  function pushSuggestion(list, item) {
    const exists = list.some((entry) => entry.transcriptLineId === item.transcriptLineId
      && entry.assetType === item.assetType
      && entry.detail === item.detail);
    if (!exists) {
      list.push(item);
    }
  }

  function generateSuggestions(episodeSummary, correctionReview) {
    const review = correctionReview || {};
    const lines = Array.isArray(review.lines) ? review.lines : [];
    const suggestions = [];

    lines.forEach((line) => {
      const speaker = speakerByRole(review, line.speakerRole);
      const label = line.speakerLabel || (speaker && speaker.label) || line.speakerRole;
      const text = `${line.text || ""} ${line.originalText || ""}`.toLowerCase();

      if (speaker && speaker.brand) {
        const brand = speaker.brand;
        if (text.indexOf(brand.toLowerCase()) >= 0 || line.kind === "transcript") {
          pushSuggestion(suggestions, {
            id: nextId(),
            status: STATUS.PENDING,
            time: line.time,
            speakerRole: line.speakerRole,
            speakerLabel: label,
            assetType: ASSET_TYPES.LOGO,
            assetLabel: "Brand logo",
            detail: brand,
            reason: buildReason(ASSET_TYPES.LOGO, label, brand),
            momentText: momentTextFor(ASSET_TYPES.LOGO, brand),
            transcriptLineId: line.id,
            momentId: null,
          });
        }
      }

      (speaker && speaker.topicTerms ? speaker.topicTerms : []).forEach((topic) => {
        if (!topic) {
          return;
        }
        if (text.indexOf(topic.toLowerCase()) >= 0 || line.source === "transcript") {
          pushSuggestion(suggestions, {
            id: nextId(),
            status: STATUS.PENDING,
            time: line.time,
            speakerRole: line.speakerRole,
            speakerLabel: label,
            assetType: ASSET_TYPES.TOPIC,
            assetLabel: "Topic card",
            detail: topic,
            reason: buildReason(ASSET_TYPES.TOPIC, label, topic),
            momentText: momentTextFor(ASSET_TYPES.TOPIC, topic),
            transcriptLineId: `${line.id}-topic-${topic}`,
            momentId: null,
          });
        }
      });

      if (speaker && speaker.brand && line.kind === "caption") {
        pushSuggestion(suggestions, {
          id: nextId(),
          status: STATUS.PENDING,
          time: line.time,
          speakerRole: line.speakerRole,
          speakerLabel: label,
          assetType: ASSET_TYPES.PRODUCT,
          assetLabel: "Product reference",
          detail: speaker.brand,
          reason: buildReason(ASSET_TYPES.PRODUCT, label, speaker.brand),
          momentText: momentTextFor(ASSET_TYPES.PRODUCT, speaker.brand),
          transcriptLineId: `${line.id}-product`,
          momentId: null,
        });
      }
    });

    if (!suggestions.length && episodeSummary && episodeSummary.episodeName) {
      const host = speakerByRole(review, "Host") || (review.speakers || [])[0];
      pushSuggestion(suggestions, {
        id: nextId(),
        status: STATUS.PENDING,
        time: "0:30",
        speakerRole: host ? host.role : "Host",
        speakerLabel: host ? host.label : "Host",
        assetType: ASSET_TYPES.SCREEN,
        assetLabel: "Episode intro card",
        detail: episodeSummary.episodeName,
        reason: `Open with a simple title card for ${episodeSummary.episodeName} so viewers know what they are watching.`,
        momentText: episodeSummary.episodeName,
        transcriptLineId: "line-intro-card",
        momentId: null,
      });
    }

    return suggestions.slice(0, 8);
  }

  function generate(session, episodeSummary, correctionReview, momentsBoard) {
    const next = clone(session || createSession(episodeSummary));
    hydrateCounter(next);
    next.generated = true;
    next.suggestions = generateSuggestions(episodeSummary, correctionReview, momentsBoard);
    return next;
  }

  function updateSuggestionStatus(session, suggestionId, status) {
    const next = clone(session || createSession({}));
    next.suggestions = (next.suggestions || []).map((item) => {
      if (item.id !== suggestionId) {
        return item;
      }
      return Object.assign({}, item, { status: status });
    });
    return next;
  }

  function acceptSuggestion(session, suggestionId) {
    return updateSuggestionStatus(session, suggestionId, STATUS.ACCEPTED);
  }

  function skipSuggestion(session, suggestionId) {
    return updateSuggestionStatus(session, suggestionId, STATUS.SKIPPED);
  }

  function acceptedSuggestions(session) {
    return (session && Array.isArray(session.suggestions) ? session.suggestions : [])
      .filter((item) => item.status === STATUS.ACCEPTED);
  }

  function applyAccepted(board, session) {
    const VM = momentsApi();
    let nextBoard = clone(board || { moments: [], transcript: [] });
    if (!VM) {
      return nextBoard;
    }
    acceptedSuggestions(session).forEach((item) => {
      if (item.momentId) {
        return;
      }
      nextBoard = VM.addMoment(nextBoard, "broll", {
        time: item.time,
        text: item.momentText,
        speakerRole: item.speakerRole,
        speakerName: item.speakerLabel,
      });
    });
    return nextBoard;
  }

  function linkMoments(session, board) {
    const VM = momentsApi();
    const next = clone(session || createSession({}));
    const moments = VM ? VM.listMoments(board) : [];
    next.suggestions = (next.suggestions || []).map((item) => {
      if (item.momentId || item.status !== STATUS.ACCEPTED) {
        return item;
      }
      const match = moments.find((moment) => moment.type === "broll"
        && moment.time === item.time
        && trim(moment.text) === trim(item.momentText));
      if (!match) {
        return item;
      }
      return Object.assign({}, item, { momentId: match.id });
    });
    return next;
  }

  function applyToBoard(board, session) {
    const nextBoard = applyAccepted(board, session);
    return {
      board: nextBoard,
      session: linkMoments(session, nextBoard),
    };
  }

  function previewAccepted(session, board) {
    const VM = momentsApi();
    const accepted = acceptedSuggestions(session);
    const moments = VM ? VM.listMoments(board) : [];
    return accepted.map((item) => {
      const moment = moments.find((entry) => entry.id === item.momentId)
        || moments.find((entry) => entry.type === "broll" && entry.time === item.time);
      return {
        id: item.id,
        time: item.time,
        reason: item.reason,
        assetLabel: item.assetLabel,
        momentText: moment ? moment.text : item.momentText,
        visible: moment ? moment.visible !== false : true,
      };
    });
  }

  function summarizeSession(session, board) {
    const list = session && Array.isArray(session.suggestions) ? session.suggestions : [];
    const accepted = list.filter((item) => item.status === STATUS.ACCEPTED);
    const skipped = list.filter((item) => item.status === STATUS.SKIPPED);
    const pending = list.filter((item) => item.status === STATUS.PENDING);
    const preview = previewAccepted(session, board);
    const lines = [];
    if (accepted.length) {
      lines.push(`Smart b-roll: ${accepted.length} accepted overlay${accepted.length === 1 ? "" : "s"}`);
    }
    if (skipped.length) {
      lines.push(`${skipped.length} skipped`);
    }
    return {
      generated: Boolean(session && session.generated),
      total: list.length,
      acceptedCount: accepted.length,
      skippedCount: skipped.length,
      pendingCount: pending.length,
      reviewLine: accepted.length
        ? `B-roll suggestions: ${accepted.length} accepted · ${skipped.length} skipped`
        : pending.length
          ? `${pending.length} b-roll suggestion${pending.length === 1 ? "" : "s"} ready to review`
          : "",
      workspaceLine: accepted.length
        ? `${accepted.length} smart b-roll overlay${accepted.length === 1 ? "" : "s"} added to visual moments`
        : "Generate smart b-roll suggestions from your transcript and social context",
      exportLines: lines,
      preview: preview,
    };
  }

  function _resetCounter() {
    suggestionCounter = 0;
  }

  const api = {
    STATUS,
    ASSET_TYPES,
    createSession,
    generate,
    acceptSuggestion,
    skipSuggestion,
    acceptedSuggestions,
    applyToBoard,
    previewAccepted,
    summarizeSession,
    _resetCounter,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcBrollSuggestions = api;
}(typeof window !== "undefined" ? window : globalThis));

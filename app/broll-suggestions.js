"use strict";

// Smart b-roll suggestions for Podcast Design Canvas (#67).
//
// Uses the episode transcript, corrected caption terms, and speaker social context to
// surface moments where a relevant logo, product reference, topic card, screen capture, or
// image would strengthen a long-form edit. The creator reviews each suggestion with a
// plain-language reason, accepts or skips it, and accepted suggestions become real b-roll
// visual moments that flow through the existing review and export path. DOM-free so the
// review screen and the tests share one source of truth. No build, no dependencies.
(function (global) {
  const BROLL_KINDS = [
    { id: "logo", label: "Logo bug" },
    { id: "product", label: "Product reference" },
    { id: "topic-card", label: "Topic card" },
    { id: "screen", label: "Screen capture" },
    { id: "image", label: "Relevant image" },
  ];

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getKind(id) {
    return BROLL_KINDS.find((kind) => kind.id === id) || BROLL_KINDS[BROLL_KINDS.length - 1];
  }

  function createBoard() {
    return { suggestions: [] };
  }

  // Pull speaker signals (name, brand, topics) from a social context review if present,
  // otherwise from the raw episode speakers. These drive logo/product/topic suggestions.
  function speakerSignals(episodeSummary, options) {
    const opts = options || {};
    if (Array.isArray(opts.speakerSignals) && opts.speakerSignals.length) {
      return opts.speakerSignals.map((sig) => ({
        role: trim(sig.role),
        name: trim(sig.name) || trim(sig.label),
        brand: trim(sig.brand),
        topics: Array.isArray(sig.topics) ? sig.topics.map(trim).filter(Boolean) : [],
      }));
    }
    const review = opts.socialReview;
    if (review && Array.isArray(review.speakers)) {
      return review.speakers.map((sp) => ({
        role: trim(sp.role),
        name: trim(sp.displayName) || trim(sp.name),
        brand: trim(sp.brand),
        topics: Array.isArray(sp.topics) ? sp.topics.map(trim).filter(Boolean) : [],
      }));
    }
    const episode = episodeSummary || {};
    return (Array.isArray(episode.speakers) ? episode.speakers : []).map((sp) => ({
      role: trim(sp.role),
      name: trim(sp.name),
      brand: "",
      topics: [],
    }));
  }

  // Caption/title lines (with times) the suggestions can attach a cutaway to. Accepts the
  // transcript correction review's lines or a plain array of { time, text, speakerRole }.
  function timedLines(options) {
    const opts = options || {};
    const source = Array.isArray(opts.lines)
      ? opts.lines
      : (opts.correctionReview && Array.isArray(opts.correctionReview.lines) ? opts.correctionReview.lines : []);
    return source
      .map((line) => ({
        time: trim(line.time) || "0:00",
        text: trim(line.text) || trim(line.originalText),
        speakerRole: trim(line.speakerRole),
        speakerName: trim(line.speakerLabel) || trim(line.speakerName),
      }))
      .filter((line) => line.text);
  }

  function pushUnique(list, seen, suggestion) {
    const key = `${suggestion.kind}::${suggestion.label.toLowerCase()}`;
    if (seen[key]) {
      return;
    }
    seen[key] = true;
    list.push(suggestion);
  }

  // Generate suggestions from the signals + timed lines. Deterministic (ids by index, no
  // randomness) so the same episode always yields the same review.
  function generateSuggestions(episodeSummary, options) {
    const signals = speakerSignals(episodeSummary, options);
    const lines = timedLines(options);
    const out = [];
    const seen = {};
    let seq = 0;
    function add(partial) {
      seq += 1;
      pushUnique(out, seen, Object.assign({
        id: `broll-${seq}`,
        time: "0:00",
        speakerRole: "",
        speakerName: "",
        sourceTerm: "",
        status: "suggested",
      }, partial));
    }

    // Logo / product references from each speaker's brand.
    signals.forEach((sig) => {
      if (sig.brand) {
        add({
          kind: "logo",
          label: `${sig.brand} logo`,
          reason: `${sig.name || sig.role || "A speaker"} represents ${sig.brand} — show the logo when they're introduced.`,
          speakerRole: sig.role,
          speakerName: sig.name,
          sourceTerm: sig.brand,
        });
      }
    });

    // Topic cards from each speaker's topics.
    signals.forEach((sig) => {
      sig.topics.forEach((topic) => {
        add({
          kind: "topic-card",
          label: `Topic card: ${topic}`,
          reason: `${sig.name || sig.role || "A speaker"} talks about ${topic} — a topic card reinforces the point.`,
          speakerRole: sig.role,
          speakerName: sig.name,
          sourceTerm: topic,
        });
      });
    });

    // Contextual cutaways tied to specific lines that mention a brand or topic term.
    const terms = [];
    signals.forEach((sig) => {
      if (sig.brand) {
        terms.push({ term: sig.brand, kind: "product" });
      }
      sig.topics.forEach((topic) => terms.push({ term: topic, kind: "screen" }));
    });
    lines.forEach((line) => {
      terms.forEach((entry) => {
        if (entry.term && new RegExp(escapeRegExp(entry.term), "i").test(line.text)) {
          add({
            kind: entry.kind,
            label: `${entry.kind === "product" ? "Product shot" : "Screen capture"}: ${entry.term}`,
            reason: `"${clip(line.text, 48)}" mentions ${entry.term} at ${line.time} — cut to a relevant visual.`,
            time: line.time,
            speakerRole: line.speakerRole,
            speakerName: line.speakerName,
            sourceTerm: entry.term,
          });
        }
      });
    });

    return { suggestions: out };
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function clip(text, max) {
    const str = trim(text);
    return str.length > max ? `${str.slice(0, max - 1)}…` : str;
  }

  function findSuggestion(board, id) {
    const list = board && Array.isArray(board.suggestions) ? board.suggestions : [];
    return list.find((item) => item.id === id) || null;
  }

  function setStatus(board, id, status) {
    const next = clone(board || createBoard());
    next.suggestions = (next.suggestions || []).map((item) =>
      item.id === id ? Object.assign({}, item, { status }) : item,
    );
    return next;
  }

  function acceptSuggestion(board, id) {
    return setStatus(board, id, "accepted");
  }

  function skipSuggestion(board, id) {
    return setStatus(board, id, "skipped");
  }

  function resetSuggestion(board, id) {
    return setStatus(board, id, "suggested");
  }

  function listByStatus(board, status) {
    const list = board && Array.isArray(board.suggestions) ? board.suggestions : [];
    return list.filter((item) => (status ? item.status === status : true));
  }

  // Plain-language preview of how an accepted suggestion lands on screen.
  function previewSuggestion(board, id) {
    const suggestion = findSuggestion(board, id);
    if (!suggestion) {
      return null;
    }
    return {
      id: suggestion.id,
      kind: suggestion.kind,
      kindLabel: getKind(suggestion.kind).label,
      label: suggestion.label,
      reason: suggestion.reason,
      time: suggestion.time,
      treatment: `${getKind(suggestion.kind).label} b-roll overlay at ${suggestion.time}`,
      status: suggestion.status,
    };
  }

  // Convert a suggestion into a visual-moments b-roll payload (for VM.addMoment).
  function toMoment(suggestion) {
    const data = suggestion || {};
    return {
      type: "broll",
      time: data.time || "0:00",
      text: `${data.label}${data.sourceTerm ? "" : ""}`,
      speakerRole: data.speakerRole || "",
      speakerName: data.speakerName || "",
    };
  }

  function acceptedMoments(board) {
    return listByStatus(board, "accepted").map(toMoment);
  }

  function summarizeBoard(board) {
    const list = board && Array.isArray(board.suggestions) ? board.suggestions : [];
    const accepted = list.filter((item) => item.status === "accepted").length;
    const skipped = list.filter((item) => item.status === "skipped").length;
    const suggested = list.filter((item) => item.status === "suggested").length;
    return {
      total: list.length,
      accepted,
      skipped,
      suggested,
      reviewLine: list.length
        ? `B-roll: ${accepted} accepted${skipped ? `, ${skipped} skipped` : ""} of ${list.length} suggested`
        : "",
      exportLines: accepted ? [`B-roll: ${accepted} contextual overlay${accepted === 1 ? "" : "s"}`] : [],
    };
  }

  function serializeBoard(board) {
    return JSON.stringify(board || createBoard());
  }

  function deserializeBoard(json) {
    if (!json) {
      return createBoard();
    }
    try {
      const parsed = typeof json === "string" ? JSON.parse(json) : json;
      if (!parsed || !Array.isArray(parsed.suggestions)) {
        return createBoard();
      }
      return {
        suggestions: parsed.suggestions
          .filter((item) => item && typeof item === "object")
          .map((item, index) => ({
            id: trim(item.id) || `broll-${index + 1}`,
            kind: getKind(item.kind).id,
            time: trim(item.time) || "0:00",
            label: trim(item.label),
            reason: trim(item.reason),
            speakerRole: trim(item.speakerRole),
            speakerName: trim(item.speakerName),
            sourceTerm: trim(item.sourceTerm),
            status: ["accepted", "skipped", "suggested"].indexOf(item.status) >= 0 ? item.status : "suggested",
          })),
      };
    } catch (err) {
      return createBoard();
    }
  }

  const api = {
    BROLL_KINDS,
    getKind,
    createBoard,
    generateSuggestions,
    findSuggestion,
    acceptSuggestion,
    skipSuggestion,
    resetSuggestion,
    listByStatus,
    previewSuggestion,
    toMoment,
    acceptedMoments,
    summarizeBoard,
    serializeBoard,
    deserializeBoard,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcBrollSuggestions = api;
}(typeof window !== "undefined" ? window : globalThis));

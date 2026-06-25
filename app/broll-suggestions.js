"use strict";

// Smart b-roll suggestion model for Podcast Design Canvas (#67).
//
// Uses the episode transcript, corrected caption terms, and speaker social context to
// surface moments where a relevant image, screen capture, logo, product reference, or topic
// card would strengthen the long-form edit. Creators review each suggestion (with a plain
// reason), accept or skip it, and accepted b-roll flows into the visual moments / review /
// export output. DOM-free so the screen and tests share one model.
(function (global) {
  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  const SUGGESTION_TYPES = [
    { id: "logo", label: "Brand logo" },
    { id: "product", label: "Product reference" },
    { id: "screen-capture", label: "Screen capture" },
    { id: "topic-card", label: "Topic card" },
    { id: "image", label: "Relevant image" },
  ];

  const STATUS = { SUGGESTED: "suggested", ACCEPTED: "accepted", SKIPPED: "skipped" };

  function getType(id) {
    return SUGGESTION_TYPES.find((t) => t.id === id) || SUGGESTION_TYPES[SUGGESTION_TYPES.length - 1];
  }

  function wordRegex(term) {
    return new RegExp(`\\b${String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  }

  // Generate b-roll suggestions. `input`:
  //   transcript — [{ id, speakerRole, speakerName, text, time }]
  //   keywords   — [string] or [{ term, kind }] corrected terms / brands / topics
  //   speakers   — [{ role, name, social: [{ label, url }] }]
  // Each suggestion is tied to a specific transcript moment and carries a plain reason.
  function generateSuggestions(input) {
    const data = input || {};
    const transcript = Array.isArray(data.transcript) ? data.transcript : [];
    const speakers = Array.isArray(data.speakers) ? data.speakers : [];
    const keywords = (Array.isArray(data.keywords) ? data.keywords : []).map((k) =>
      typeof k === "string" ? { term: trim(k), kind: "topic-card" } : { term: trim(k.term), kind: k.kind || "topic-card" }
    ).filter((k) => k.term);

    const suggestions = [];
    let seq = 0;
    function push(s) {
      seq += 1;
      suggestions.push(Object.assign({ id: `broll-${seq}`, status: STATUS.SUGGESTED }, s));
    }

    // 1) Keyword/term mentions → product / topic / logo cards at the line where they appear.
    keywords.forEach((kw) => {
      const line = transcript.find((l) => wordRegex(kw.term).test(l.text || ""));
      if (line) {
        const type = getType(kw.kind).id;
        push({
          type: type,
          term: kw.term,
          momentId: line.id,
          time: line.time || "",
          speakerRole: line.speakerRole || "All speakers",
          text: `${kw.term} — ${getType(type).label}`,
          reason: `“${kw.term}” is mentioned at ${line.time || "this moment"} — add ${getType(type).label.toLowerCase()} so viewers see what's being discussed.`,
        });
      }
    });

    // 2) Speaker social context → a brand logo bug when the speaker is introduced.
    speakers.forEach((sp) => {
      const social = Array.isArray(sp.social) ? sp.social : [];
      if (!social.length) {
        return;
      }
      const line = transcript.find((l) => (l.speakerName || "") === (sp.name || "") || (l.speakerRole || "") === (sp.role || ""));
      push({
        type: "logo",
        term: sp.name || sp.role || "Speaker",
        momentId: line ? line.id : "",
        time: line ? (line.time || "") : "0:00",
        speakerRole: sp.role || "Speaker",
        text: `${sp.name || sp.role} — social/brand lower-third`,
        reason: `${sp.name || "This speaker"} has a public profile (${social[0].label || "social link"}) — show their handle/logo when they're introduced.`,
      });
    });

    return { suggestions };
  }

  function normalize(set) {
    return { suggestions: set && Array.isArray(set.suggestions) ? set.suggestions.slice() : [] };
  }

  function setStatus(set, id, status) {
    const base = normalize(set);
    return {
      suggestions: base.suggestions.map((s) => (s.id === id ? Object.assign({}, s, { status }) : s)),
    };
  }

  function acceptSuggestion(set, id) {
    return setStatus(set, id, STATUS.ACCEPTED);
  }

  function skipSuggestion(set, id) {
    return setStatus(set, id, STATUS.SKIPPED);
  }

  function listByStatus(set, status) {
    return normalize(set).suggestions.filter((s) => s.status === status);
  }

  // Convert an accepted suggestion into a visual-moment-shaped object for the moments board.
  function toVisualMoment(suggestion) {
    const s = suggestion || {};
    return {
      type: "broll",
      text: s.text || `${s.term || "B-roll"}`,
      time: s.time || "0:00",
      speakerRole: s.speakerRole || "All speakers",
      source: "broll-suggestion",
      brollType: s.type || "image",
    };
  }

  // All accepted suggestions as visual moments — for the review and export flow.
  function acceptedMoments(set) {
    return listByStatus(set, STATUS.ACCEPTED).map(toVisualMoment);
  }

  // Lines describing accepted b-roll for the publish/export output.
  function buildExportBroll(set) {
    const accepted = listByStatus(set, STATUS.ACCEPTED);
    return {
      count: accepted.length,
      lines: accepted.map((s) => `${s.time || "0:00"} · ${getType(s.type).label}: ${s.term}`),
    };
  }

  function summarize(set) {
    const base = normalize(set);
    const counts = { suggested: 0, accepted: 0, skipped: 0 };
    base.suggestions.forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1; });
    return {
      total: base.suggestions.length,
      suggestedCount: counts.suggested,
      acceptedCount: counts.accepted,
      skippedCount: counts.skipped,
      reviewLine: base.suggestions.length
        ? `${counts.accepted} accepted · ${counts.suggested} to review · ${counts.skipped} skipped`
        : "No b-roll suggestions yet",
    };
  }

  function serialize(set) {
    return JSON.stringify(normalize(set));
  }

  function deserialize(json) {
    if (!json) {
      return { suggestions: [] };
    }
    try {
      const parsed = JSON.parse(json);
      return { suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [] };
    } catch (err) {
      return { suggestions: [] };
    }
  }

  const api = {
    SUGGESTION_TYPES,
    STATUS,
    getType,
    generateSuggestions,
    acceptSuggestion,
    skipSuggestion,
    listByStatus,
    toVisualMoment,
    acceptedMoments,
    buildExportBroll,
    summarize,
    serialize,
    deserialize,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcBrollSuggestions = api;
}(typeof window !== "undefined" ? window : globalThis));

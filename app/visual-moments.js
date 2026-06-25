"use strict";

// Visual moments editor model for Podcast Design Canvas (#19 — contextual editing layer).
//
// This is the single source of truth for the editing stage that turns a long-form recording
// into a deliberately produced episode: a transcript-style, speaker-aware timeline onto which
// the creator places polished visual treatments — captions, title moments, b-roll overlays,
// visual callouts, and short overlay notes — at meaningful points across the conversation.
// Everything is creator-facing (no pipeline jargon) and DOM-free, so the same rules drive the
// editing screen and the tests. No build, no dependencies.
(function (global) {
  // The treatments a creator can place. Each is a creator-facing quality choice, not a
  // technical effect. `showsText` types carry on-screen copy that must not be left empty.
  const MOMENT_TYPES = [
    { id: "caption", label: "Caption", showsText: true, defaultText: "Add a caption for this moment", hint: "Readable on-screen text that follows the conversation." },
    { id: "title", label: "Title moment", showsText: true, defaultText: "Section title", hint: "A full-frame title card that introduces a segment." },
    { id: "broll", label: "B-roll overlay", showsText: true, defaultText: "Describe the b-roll to show", hint: "A supporting visual layered over the speakers." },
    { id: "callout", label: "Visual callout", showsText: true, defaultText: "Highlight a key point", hint: "A pointer or emphasis on something being discussed." },
    { id: "note", label: "Overlay note", showsText: true, defaultText: "A small on-screen note", hint: "A subtle corner note — a handle, source, or reference." },
  ];

  // A small, deterministic transcript-style script so the timeline reads like a real episode
  // out of the box. Lines are assigned to the episode's speakers in turn (speaker-aware).
  const SCRIPT_LINES = [
    "Welcome in — really glad to have you on the show today.",
    "Thanks for having me, I've been looking forward to this one.",
    "Let's start at the beginning — how did this whole thing get going?",
    "It started as a side project that completely took over my weekends.",
    "There's a moment everyone points to as the turning point.",
    "For us it was the first time a stranger paid for it.",
    "I want to dig into the hard part nobody talks about.",
    "Honestly? Saying no to good ideas to protect the core one.",
    "What does a normal day look like for you now?",
    "A lot less glamorous than people imagine — mostly listening.",
    "Before we wrap, what's the one thing you'd tell your past self?",
    "Start before you feel ready. The rest is just iteration.",
  ];

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clampText(value, max) {
    const text = trim(value);
    return text.length > max ? text.slice(0, max) : text;
  }

  function getType(id) {
    return MOMENT_TYPES.find((type) => type.id === id) || MOMENT_TYPES[0];
  }

  // MM:SS for the editor timeline and previews (creator-facing, no frame/sample units).
  function formatTimecode(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }

  function speakersOf(summary) {
    const speakers = summary && Array.isArray(summary.speakers) ? summary.speakers : [];
    const usable = speakers.filter((s) => s && (trim(s.role) || trim(s.name)));
    if (usable.length) {
      return usable.map((s, i) => ({ role: trim(s.role) || `Speaker ${i + 1}`, name: trim(s.name) || "Unnamed speaker" }));
    }
    return [{ role: "Host", name: "Host" }];
  }

  // Build the transcript-style timeline: evenly spaced segments across the episode, each
  // attributed to a speaker in turn so moments can be placed against who is talking.
  function buildTimeline(summary, durationSeconds) {
    const speakers = speakersOf(summary);
    const duration = Math.max(60, Math.round(Number(durationSeconds) || 3600));
    const count = SCRIPT_LINES.length;
    const step = Math.floor(duration / (count + 1));
    return SCRIPT_LINES.map((line, index) => {
      const speaker = speakers[index % speakers.length];
      const time = step * (index + 1);
      return {
        time,
        timecode: formatTimecode(time),
        speakerRole: speaker.role,
        speakerName: speaker.name,
        text: line,
      };
    });
  }

  // A fresh editing document for an episode. Holds the timeline plus the placed moments and
  // a monotonic counter so each moment gets a stable id without relying on wall-clock time.
  function createDoc(summary, durationSeconds) {
    const duration = Math.max(60, Math.round(Number(durationSeconds) || 3600));
    return {
      episodeName: trim(summary && summary.episodeName) || "Untitled episode",
      durationSeconds: duration,
      timeline: buildTimeline(summary, duration),
      moments: [],
      seq: 0,
    };
  }

  function clampTime(doc, seconds) {
    const max = doc && doc.durationSeconds ? doc.durationSeconds : 3600;
    const value = Math.round(Number(seconds) || 0);
    return Math.min(Math.max(0, value), max);
  }

  // Place a new moment of `type` at a point in the episode. Seeds creator-facing default
  // copy and, when a timeline segment sits at that time, the speaker it lands on.
  function addMoment(doc, typeId, atSeconds) {
    const type = getType(typeId);
    const time = clampTime(doc, atSeconds);
    doc.seq += 1;
    const segment = nearestSegment(doc, time);
    const moment = {
      id: `m${doc.seq}`,
      type: type.id,
      typeLabel: type.label,
      time,
      timecode: formatTimecode(time),
      text: type.defaultText,
      speakerRole: segment ? segment.speakerRole : "",
      visible: true,
    };
    doc.moments.push(moment);
    return moment;
  }

  function findMoment(doc, id) {
    return (doc.moments || []).find((moment) => moment.id === id) || null;
  }

  // Edit a moment's timing, text, or visibility. Time is clamped to the episode; text is
  // trimmed and length-capped. Returns the updated moment (or null if it does not exist).
  function updateMoment(doc, id, changes) {
    const moment = findMoment(doc, id);
    if (!moment) {
      return null;
    }
    const data = changes || {};
    if (Object.prototype.hasOwnProperty.call(data, "text")) {
      moment.text = clampText(data.text, 140);
    }
    if (Object.prototype.hasOwnProperty.call(data, "time")) {
      moment.time = clampTime(doc, data.time);
      moment.timecode = formatTimecode(moment.time);
      const segment = nearestSegment(doc, moment.time);
      moment.speakerRole = segment ? segment.speakerRole : "";
    }
    if (Object.prototype.hasOwnProperty.call(data, "visible")) {
      moment.visible = Boolean(data.visible);
    }
    return moment;
  }

  function toggleMoment(doc, id) {
    const moment = findMoment(doc, id);
    if (moment) {
      moment.visible = !moment.visible;
    }
    return moment;
  }

  function removeMoment(doc, id) {
    const before = doc.moments.length;
    doc.moments = doc.moments.filter((moment) => moment.id !== id);
    return doc.moments.length < before;
  }

  // Moments in playback order, so the editor and preview read top-to-bottom by time.
  function listMoments(doc) {
    return (doc.moments || []).slice().sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  }

  function nearestSegment(doc, seconds) {
    const timeline = (doc && doc.timeline) || [];
    if (!timeline.length) {
      return null;
    }
    let best = timeline[0];
    let bestGap = Math.abs(timeline[0].time - seconds);
    timeline.forEach((segment) => {
      const gap = Math.abs(segment.time - seconds);
      if (gap < bestGap) {
        best = segment;
        bestGap = gap;
      }
    });
    return best;
  }

  // A creator-facing description of how the selected moment changes the episode look at its
  // point in time — what a reviewer would see on screen. Drives the editor's preview panel.
  function previewMoment(doc, id) {
    const moment = findMoment(doc, id);
    if (!moment) {
      return null;
    }
    const type = getType(moment.type);
    const text = trim(moment.text) || type.defaultText;
    const where = moment.speakerRole ? ` while ${moment.speakerRole} is talking` : "";
    let effect;
    if (type.id === "title") {
      effect = `A full-frame title card reading “${text}” opens this section`;
    } else if (type.id === "caption") {
      effect = `A caption band shows “${text}”`;
    } else if (type.id === "broll") {
      effect = `B-roll (“${text}”) is layered over the speakers`;
    } else if (type.id === "callout") {
      effect = `A callout highlights “${text}”`;
    } else {
      effect = `A small overlay note reads “${text}”`;
    }
    return {
      id: moment.id,
      typeLabel: type.label,
      timecode: moment.timecode,
      visible: moment.visible,
      speakerRole: moment.speakerRole,
      headline: `${type.label} at ${moment.timecode}`,
      effect: moment.visible ? `${effect}${where}.` : `${type.label} hidden — it will not appear in the episode.`,
    };
  }

  // Counts and a one-line rollup for the workspace/review, so the rest of the app can show
  // how produced the episode is without re-deriving anything.
  function summarizeMoments(doc) {
    const moments = (doc && doc.moments) || [];
    const visible = moments.filter((moment) => moment.visible);
    const byType = {};
    MOMENT_TYPES.forEach((type) => {
      byType[type.id] = visible.filter((moment) => moment.type === type.id).length;
    });
    const parts = MOMENT_TYPES
      .filter((type) => byType[type.id] > 0)
      .map((type) => `${byType[type.id]} ${type.label.toLowerCase()}${byType[type.id] === 1 ? "" : "s"}`);
    return {
      total: moments.length,
      visibleCount: visible.length,
      byType,
      typesUsed: MOMENT_TYPES.filter((type) => byType[type.id] > 0).map((type) => type.id),
      line: parts.length ? parts.join(" · ") : "No visual moments yet",
    };
  }

  // ---- Persistence: keep placed moments when navigating away and back ----------------------

  // Serialize only the placed moments (+ duration and counter). The timeline is rebuilt from
  // the current episode on load, so reused moments re-anchor to the real speakers.
  function serialize(doc) {
    const state = doc || {};
    return JSON.stringify({
      v: 1,
      durationSeconds: state.durationSeconds || 3600,
      seq: state.seq || 0,
      moments: (state.moments || []).map((moment) => ({
        id: moment.id,
        type: moment.type,
        time: moment.time,
        text: moment.text,
        visible: moment.visible !== false,
      })),
    });
  }

  // Rebuild a document for `summary`, restoring previously placed moments by re-anchoring
  // each to the timeline (so speaker attribution stays correct for the current episode).
  function deserialize(raw, summary) {
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch (err) {
      parsed = null;
    }
    const duration = parsed && parsed.durationSeconds ? parsed.durationSeconds : 3600;
    const doc = createDoc(summary, duration);
    if (!parsed || !Array.isArray(parsed.moments)) {
      return doc;
    }
    let maxSeq = 0;
    parsed.moments.forEach((saved) => {
      const type = getType(saved.type);
      const time = clampTime(doc, saved.time);
      const segment = nearestSegment(doc, time);
      const id = trim(saved.id) || `m${doc.moments.length + 1}`;
      const num = Number(String(id).replace(/[^0-9]/g, ""));
      if (num > maxSeq) {
        maxSeq = num;
      }
      doc.moments.push({
        id,
        type: type.id,
        typeLabel: type.label,
        time,
        timecode: formatTimecode(time),
        text: clampText(saved.text, 140) || type.defaultText,
        speakerRole: segment ? segment.speakerRole : "",
        visible: saved.visible !== false,
      });
    });
    doc.seq = Math.max(parsed.seq || 0, maxSeq);
    return doc;
  }

  const api = {
    MOMENT_TYPES,
    getType,
    formatTimecode,
    buildTimeline,
    createDoc,
    addMoment,
    findMoment,
    updateMoment,
    toggleMoment,
    removeMoment,
    listMoments,
    nearestSegment,
    previewMoment,
    summarizeMoments,
    serialize,
    deserialize,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcVisualMoments = api;
}(typeof window !== "undefined" ? window : globalThis));

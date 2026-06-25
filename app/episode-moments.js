"use strict";

// Visual moments editor model for Podcast Design Canvas (#19 — contextual visuals).
//
// This is the single source of truth for the contextual editing layer that turns a raw
// long-form recording into a deliberately produced episode: captions, title moments,
// b-roll overlays, and visual callouts placed at meaningful points across the conversation.
// Like the setup and style models, it is deliberately DOM-free so the exact same rules run
// in the browser (the editor screen imports it as a global) and in node (the tests
// `require` it). No build step, no dependencies.
(function (global) {
  // The four creator-facing moment types the editor offers. Each is a quality choice a
  // creator understands — never internal pipeline language. `speakerAware` types can be
  // pinned to a Host/Guest bucket so the treatment follows whoever is talking.
  const MOMENT_TYPES = [
    {
      key: "caption",
      label: "Caption",
      noun: "caption",
      speakerAware: true,
      defaultText: "New caption line",
      hint: "On-screen text for what's being said at this point.",
    },
    {
      key: "title",
      label: "Title moment",
      noun: "title moment",
      speakerAware: false,
      defaultText: "Section title",
      hint: "A full-screen title card that opens a chapter or topic.",
    },
    {
      key: "broll",
      label: "B-roll overlay",
      noun: "b-roll overlay",
      speakerAware: false,
      defaultText: "Describe the b-roll to show here",
      hint: "Cut to a supporting visual while the audio keeps playing.",
    },
    {
      key: "callout",
      label: "Visual callout",
      noun: "visual callout",
      speakerAware: true,
      defaultText: "Callout note",
      hint: "Pin a small note, name, or reference over the active speaker.",
    },
  ];

  // A sensible default episode length so the timeline has a scale before real duration is
  // known. Long-form on purpose — the product targets hour-plus episodes, not short clips.
  const DEFAULT_DURATION_SECONDS = 60 * 60;

  // Monotonic id source so every moment is uniquely addressable for edit/remove/preview.
  let idSeq = 0;
  function nextMomentId() {
    idSeq += 1;
    return `moment-${idSeq}`;
  }

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function getMomentType(key) {
    return MOMENT_TYPES.find((type) => type.key === key) || MOMENT_TYPES[0];
  }

  function normalizeDuration(value) {
    const seconds = Math.floor(Number(value));
    return isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_DURATION_SECONDS;
  }

  // Keep a time inside the episode bounds as a whole number of seconds.
  function clampTime(value, durationSeconds) {
    const duration = normalizeDuration(durationSeconds);
    const seconds = Math.floor(Number(value));
    if (!isFinite(seconds) || seconds < 0) {
      return 0;
    }
    return Math.min(seconds, duration);
  }

  // Render seconds as a creator-facing timecode: mm:ss, or h:mm:ss past an hour.
  function formatTimecode(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const ss = String(secs).padStart(2, "0");
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, "0")}:${ss}`;
    }
    return `${mins}:${ss}`;
  }

  // Parse a typed timecode back to seconds. Accepts "90", "1:30", or "1:01:05". Returns null
  // when the text isn't a clean timecode so the editor can keep the previous value.
  function parseTimecode(text) {
    if (typeof text === "number") {
      return isFinite(text) && text >= 0 ? Math.floor(text) : null;
    }
    const str = trim(text);
    if (!str) {
      return null;
    }
    const parts = str.split(":");
    if (parts.some((part) => !/^\d+$/.test(part.trim()))) {
      return null;
    }
    return parts.reduce((acc, part) => acc * 60 + parseInt(part.trim(), 10), 0);
  }

  // A fresh, empty moments state for an episode. Duration scales the timeline.
  function createMomentsState(durationSeconds) {
    return { durationSeconds: normalizeDuration(durationSeconds), moments: [] };
  }

  // A single visual moment. Captions and callouts may carry a speaker role so the
  // treatment can follow whoever is talking; titles and b-roll are episode-level.
  function createMoment(typeKey, atSeconds, overrides) {
    const type = getMomentType(typeKey);
    const extra = overrides && typeof overrides === "object" ? overrides : {};
    return {
      id: nextMomentId(),
      type: type.key,
      atSeconds: clampTime(atSeconds, extra.durationSeconds),
      text: typeof extra.text === "string" ? extra.text : type.defaultText,
      speakerRole: type.speakerAware ? trim(extra.speakerRole) : "",
      visible: extra.visible === false ? false : true,
    };
  }

  function findMoment(state, id) {
    const list = state && Array.isArray(state.moments) ? state.moments : [];
    return list.find((moment) => moment && moment.id === id) || null;
  }

  // Add a moment of `typeKey` at `atSeconds`. Returns the created moment so the caller can
  // focus or select it. `overrides` can seed text / speakerRole for that type.
  function addMoment(state, typeKey, atSeconds, overrides) {
    if (!state || !Array.isArray(state.moments)) {
      return null;
    }
    const moment = createMoment(typeKey, atSeconds, Object.assign({ durationSeconds: state.durationSeconds }, overrides));
    state.moments.push(moment);
    return moment;
  }

  // Apply a partial edit to a moment. Only the editable fields are touched; time is clamped
  // to the episode bounds, visibility is coerced to a boolean. Returns the moment, or null.
  function updateMoment(state, id, changes) {
    const moment = findMoment(state, id);
    if (!moment) {
      return null;
    }
    const next = changes && typeof changes === "object" ? changes : {};
    if (Object.prototype.hasOwnProperty.call(next, "text")) {
      moment.text = typeof next.text === "string" ? next.text : "";
    }
    if (Object.prototype.hasOwnProperty.call(next, "atSeconds")) {
      moment.atSeconds = clampTime(next.atSeconds, state.durationSeconds);
    }
    if (Object.prototype.hasOwnProperty.call(next, "speakerRole")) {
      const type = getMomentType(moment.type);
      moment.speakerRole = type.speakerAware ? trim(next.speakerRole) : "";
    }
    if (Object.prototype.hasOwnProperty.call(next, "visible")) {
      moment.visible = Boolean(next.visible);
    }
    return moment;
  }

  function removeMoment(state, id) {
    if (!state || !Array.isArray(state.moments)) {
      return false;
    }
    const index = state.moments.findIndex((moment) => moment && moment.id === id);
    if (index < 0) {
      return false;
    }
    state.moments.splice(index, 1);
    return true;
  }

  // Flip a moment's visibility — the editor's quick show/hide without losing the moment.
  function toggleVisible(state, id) {
    const moment = findMoment(state, id);
    if (!moment) {
      return null;
    }
    moment.visible = moment.visible === false;
    return moment;
  }

  // Validate a single moment against rules a reviewer can feel in the UI. Returns
  // { ok, error } with a creator-facing message.
  function validateMoment(moment, durationSeconds) {
    const data = moment && typeof moment === "object" ? moment : {};
    const type = getMomentType(data.type);
    const duration = normalizeDuration(durationSeconds);
    if (!trim(data.text)) {
      return { ok: false, error: `Add text for this ${type.noun} so it reads clearly on screen.` };
    }
    const at = Number(data.atSeconds);
    if (!isFinite(at) || at < 0) {
      return { ok: false, error: "Give this moment a valid start time." };
    }
    if (at > duration) {
      return { ok: false, error: `This moment lands after the episode ends (${formatTimecode(duration)}).` };
    }
    return { ok: true };
  }

  function resolveSpeakerName(speakers, role) {
    const wanted = trim(role);
    if (!wanted) {
      return "";
    }
    const list = Array.isArray(speakers) ? speakers : [];
    const match = list.find((speaker) => speaker && trim(speaker.role) === wanted);
    return match ? trim(match.name) : "";
  }

  // A creator-facing description of how a moment shows up on screen. The caption treatment
  // honors the applied preset's caption style so the editor stays consistent with the look.
  function describeTreatment(typeKey, captionStyle) {
    switch (getMomentType(typeKey).key) {
      case "caption":
        return `${trim(captionStyle) || "Lower-third"} caption`;
      case "title":
        return "Full-screen title card";
      case "broll":
        return "B-roll overlay covers the frame";
      case "callout":
        return "Pinned callout over the active speaker";
      default:
        return "On-screen treatment";
    }
  }

  // Build the ordered, speaker-aware timeline the editor renders: every moment sorted by
  // time, resolved to its speaker name, with a 0..1 position for placing it on a track.
  // Derived entirely from state — never invented — so the timeline is honest.
  function buildTimeline(state, speakers) {
    const list = state && Array.isArray(state.moments) ? state.moments : [];
    const duration = normalizeDuration(state && state.durationSeconds);
    const people = Array.isArray(speakers) ? speakers : [];
    return list
      .map((moment, index) => ({ moment, index }))
      .sort((a, b) => (a.moment.atSeconds - b.moment.atSeconds) || (a.index - b.index))
      .map(({ moment }) => {
        const type = getMomentType(moment.type);
        const speakerRole = type.speakerAware ? trim(moment.speakerRole) : "";
        return {
          id: moment.id,
          type: type.key,
          typeLabel: type.label,
          atSeconds: moment.atSeconds,
          timecode: formatTimecode(moment.atSeconds),
          text: trim(moment.text),
          speakerRole,
          speakerName: speakerRole ? resolveSpeakerName(people, speakerRole) : "",
          visible: moment.visible !== false,
          position: duration > 0 ? Math.min(1, Math.max(0, moment.atSeconds / duration)) : 0,
        };
      });
  }

  // Everything the preview shows for one selected moment: its treatment, timing, text, and
  // the speaker it follows. `options.captionStyle` ties captions to the chosen preset.
  function previewMoment(state, id, options) {
    const moment = findMoment(state, id);
    if (!moment) {
      return null;
    }
    const opts = options && typeof options === "object" ? options : {};
    const type = getMomentType(moment.type);
    const speakerRole = type.speakerAware ? trim(moment.speakerRole) : "";
    return {
      id: moment.id,
      type: type.key,
      typeLabel: type.label,
      timecode: formatTimecode(moment.atSeconds),
      text: trim(moment.text),
      speakerRole,
      speakerName: speakerRole ? resolveSpeakerName(opts.speakers, speakerRole) : "",
      visible: moment.visible !== false,
      treatment: describeTreatment(type.key, opts.captionStyle),
    };
  }

  // Counts the workspace and editor surface once moments exist: totals, visible/hidden, and
  // a per-type breakdown so the creator can see the episode is getting deliberately produced.
  function summarizeMoments(state) {
    const list = state && Array.isArray(state.moments) ? state.moments : [];
    const byType = {};
    MOMENT_TYPES.forEach((type) => {
      byType[type.key] = 0;
    });
    let visible = 0;
    list.forEach((moment) => {
      byType[getMomentType(moment.type).key] += 1;
      if (moment.visible !== false) {
        visible += 1;
      }
    });
    return {
      total: list.length,
      visible,
      hidden: list.length - visible,
      byType,
      typesUsed: MOMENT_TYPES.filter((type) => byType[type.key] > 0).map((type) => type.key),
    };
  }

  const api = {
    MOMENT_TYPES,
    DEFAULT_DURATION_SECONDS,
    getMomentType,
    normalizeDuration,
    clampTime,
    formatTimecode,
    parseTimecode,
    createMomentsState,
    createMoment,
    findMoment,
    addMoment,
    updateMoment,
    removeMoment,
    toggleVisible,
    validateMoment,
    buildTimeline,
    previewMoment,
    summarizeMoments,
    describeTreatment,
    resolveSpeakerName,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcEpisodeMoments = api;
}(typeof window !== "undefined" ? window : globalThis));

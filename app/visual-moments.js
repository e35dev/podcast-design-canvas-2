"use strict";

// Visual moments model for Podcast Design Canvas (#19).
//
// Full-episode timeline of caption sections, title moments, b-roll placeholders, and
// visual callouts — speaker-aware and editable without frame-by-frame work. DOM-free
// so the moments editor and tests share one source of truth.
(function (global) {
  const MOMENT_TYPES = [
    {
      id: "caption",
      label: "Caption",
      hint: "On-screen text synced to what is being said.",
      previewClass: "moment-preview-caption",
    },
    {
      id: "title",
      label: "Title moment",
      hint: "A bold chapter or topic title across the frame.",
      previewClass: "moment-preview-title",
    },
    {
      id: "broll",
      label: "B-roll overlay",
      hint: "A visual cutaway placeholder at a key point.",
      previewClass: "moment-preview-broll",
    },
    {
      id: "callout",
      label: "Visual callout",
      hint: "A branded note or highlight on screen.",
      previewClass: "moment-preview-callout",
    },
  ];

  let momentCounter = 0;

  function getMomentType(id) {
    return MOMENT_TYPES.find((type) => type.id === id) || MOMENT_TYPES[0];
  }

  function defaultText(typeId, speaker) {
    const name = (speaker && speaker.name) || "Speaker";
    const role = (speaker && speaker.role) || "Host";
    if (typeId === "title") {
      return `${role} — ${name}`;
    }
    if (typeId === "broll") {
      return "B-roll placeholder — supporting visuals";
    }
    if (typeId === "callout") {
      return "Key takeaway";
    }
    return `Sample caption for ${name}`;
  }

  function createMoment(typeId, speaker, startSec, options) {
    momentCounter += 1;
    const opts = options || {};
    const type = getMomentType(typeId);
    return {
      id: opts.id || `moment-${momentCounter}`,
      type: type.id,
      speakerRole: (speaker && speaker.role) || "",
      speakerName: (speaker && speaker.name) || "",
      startSec: typeof startSec === "number" ? startSec : 0,
      endSec: typeof opts.endSec === "number" ? opts.endSec : startSec + 30,
      text: opts.text || defaultText(type.id, speaker),
      visible: opts.visible !== false,
    };
  }

  // Seed a transcript-style timeline from the episode speakers.
  function seedMoments(episodeSummary) {
    const speakers = episodeSummary && Array.isArray(episodeSummary.speakers)
      ? episodeSummary.speakers
      : [];
    if (!speakers.length) {
      return [createMoment("caption", { role: "Host", name: "Speaker" }, 0, { endSec: 60 })];
    }
    let cursor = 0;
    return speakers.map((speaker, index) => {
      const typeId = index === 0 ? "title" : index === 1 ? "caption" : index % 2 === 0 ? "callout" : "broll";
      const moment = createMoment(typeId, speaker, cursor, { endSec: cursor + 45 });
      cursor += 50;
      return moment;
    });
  }

  function createTimeline(episodeSummary) {
    const episode = episodeSummary || {};
    const moments = seedMoments(episode);
    return {
      episodeName: episode.episodeName || "",
      moments: moments,
      selectedId: moments.length ? moments[0].id : null,
    };
  }

  function cloneTimeline(timeline) {
    return JSON.parse(JSON.stringify(timeline || createTimeline({})));
  }

  function sortedMoments(timeline) {
    const list = timeline && Array.isArray(timeline.moments) ? timeline.moments.slice() : [];
    return list.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  }

  function findMoment(timeline, id) {
    const list = timeline && Array.isArray(timeline.moments) ? timeline.moments : [];
    return list.find((moment) => moment.id === id) || null;
  }

  function selectMoment(timeline, id) {
    const next = cloneTimeline(timeline);
    next.selectedId = id;
    return next;
  }

  function addMoment(timeline, typeId, speaker) {
    const next = cloneTimeline(timeline);
    const list = sortedMoments(next);
    const last = list.length ? list[list.length - 1] : null;
    const startSec = last ? last.endSec + 10 : 0;
    const sp = speaker || { role: "Host", name: "Speaker" };
    const moment = createMoment(typeId, sp, startSec, { endSec: startSec + 30 });
    next.moments.push(moment);
    next.selectedId = moment.id;
    return next;
  }

  function updateMoment(timeline, id, updates) {
    const next = cloneTimeline(timeline);
    const patch = updates || {};
    next.moments = next.moments.map((moment) => {
      if (moment.id !== id) {
        return moment;
      }
      const updated = Object.assign({}, moment);
      if (typeof patch.text === "string") {
        updated.text = patch.text;
      }
      if (typeof patch.visible === "boolean") {
        updated.visible = patch.visible;
      }
      if (typeof patch.startSec === "number") {
        updated.startSec = patch.startSec;
      }
      if (typeof patch.endSec === "number") {
        updated.endSec = patch.endSec;
      }
      if (patch.speakerRole) {
        updated.speakerRole = patch.speakerRole;
      }
      if (patch.speakerName) {
        updated.speakerName = patch.speakerName;
      }
      if (updated.endSec < updated.startSec) {
        updated.endSec = updated.startSec + 5;
      }
      return updated;
    });
    return next;
  }

  function toggleMomentVisibility(timeline, id) {
    const moment = findMoment(timeline, id);
    if (!moment) {
      return cloneTimeline(timeline);
    }
    return updateMoment(timeline, id, { visible: !moment.visible });
  }

  function removeMoment(timeline, id) {
    const next = cloneTimeline(timeline);
    next.moments = next.moments.filter((moment) => moment.id !== id);
    if (next.selectedId === id) {
      next.selectedId = next.moments.length ? next.moments[0].id : null;
    }
    return next;
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }

  function parseTime(value) {
    if (typeof value === "number" && !Number.isNaN(value)) {
      return Math.max(0, Math.floor(value));
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      return 0;
    }
    const parts = text.split(":");
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10) || 0;
      const secs = parseInt(parts[1], 10) || 0;
      return mins * 60 + secs;
    }
    const asNum = parseInt(text, 10);
    return Number.isNaN(asNum) ? 0 : Math.max(0, asNum);
  }

  function summarizeTimeline(timeline) {
    const list = sortedMoments(timeline);
    const visible = list.filter((moment) => moment.visible);
    const typeCounts = {};
    visible.forEach((moment) => {
      typeCounts[moment.type] = (typeCounts[moment.type] || 0) + 1;
    });
    return {
      momentCount: list.length,
      visibleCount: visible.length,
      typeCounts: typeCounts,
      durationSec: list.length ? Math.max.apply(null, list.map((m) => m.endSec)) : 0,
      summaryLine: visible
        .map((moment) => `${formatTime(moment.startSec)} ${getMomentType(moment.type).label}`)
        .join(" · "),
    };
  }

  // Preview descriptor for how a moment looks on the episode frame.
  function buildMomentPreview(moment, styleContext) {
    const item = moment || createMoment("caption", {}, 0);
    const type = getMomentType(item.type);
    const style = styleContext || {};
    return {
      typeId: type.id,
      typeLabel: type.label,
      previewClass: type.previewClass,
      text: item.text,
      speakerRole: item.speakerRole,
      speakerName: item.speakerName,
      visible: item.visible !== false,
      timeLabel: `${formatTime(item.startSec)} – ${formatTime(item.endSec)}`,
      accent: style.accent || "#6c4cff",
      background: style.background || "#10131f",
    };
  }

  function serializeTimeline(timeline) {
    return JSON.stringify(timeline || createTimeline({}));
  }

  function deserializeTimeline(json) {
    if (!json) {
      return null;
    }
    try {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.moments)) {
        return null;
      }
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function _resetMomentCounter() {
    momentCounter = 0;
  }

  const api = {
    MOMENT_TYPES,
    getMomentType,
    createTimeline,
    cloneTimeline,
    sortedMoments,
    findMoment,
    selectMoment,
    addMoment,
    updateMoment,
    toggleMomentVisibility,
    removeMoment,
    formatTime,
    parseTime,
    summarizeTimeline,
    buildMomentPreview,
    serializeTimeline,
    deserializeTimeline,
    _resetMomentCounter,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcVisualMoments = api;
}(typeof window !== "undefined" ? window : globalThis));

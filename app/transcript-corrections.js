"use strict";

// Transcript and caption correction review (#63).
//
// Lets creators normalize speaker names, brand terms, topic tags, and caption/title
// text before export. Corrections flow into transcript labels, moments, and publish
// package copy. DOM-free so UI and tests share one source of truth.
(function (global) {
  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function splitList(value) {
    if (Array.isArray(value)) {
      return value.map(trim).filter(Boolean);
    }
    if (typeof value !== "string") {
      return [];
    }
    return value.split(",").map(trim).filter(Boolean);
  }

  function safeMomentLabel(moment, index) {
    return moment && moment.id ? moment.id : String(index);
  }

  function findSpeaker(review, speakerRole, speakerName) {
    const speakers = review && Array.isArray(review.speakers) ? review.speakers : [];
    const byRole = speakers.find((entry) => entry.role === speakerRole);
    if (byRole) {
      return byRole;
    }
    return speakers.find((entry) => entry.speakerName === speakerName) || null;
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function applyReplacements(value, replacements) {
    let next = trim(value);
    if (!next) {
      return next;
    }
    const list = Array.isArray(replacements) ? replacements : [];
    if (!list.length) {
      return next;
    }
    list.forEach((entry) => {
      if (!entry || !entry.from || !entry.to) {
        return;
      }
      const pattern = new RegExp(escapeRegExp(entry.from), "gi");
      next = next.replace(pattern, entry.to);
    });
    return next;
  }

  function speakerCorrectionRows(summary) {
    const episode = summary || {};
    const speakers = Array.isArray(episode.speakers) ? episode.speakers : [];
    return speakers.map((speaker) => {
      const name = trim(speaker.name);
      return {
        role: trim(speaker.role) || "Speaker",
        speakerName: name || "Speaker",
        speakerNameCorrected: name,
        brand: trim(speaker.brand) || "",
        brandCorrected: "",
        topics: splitList(speaker.topics || []),
        topicsCorrected: [],
      };
    });
  }

  function momentCorrectionRows(board) {
    const moments = board && Array.isArray(board.moments) ? board.moments : [];
    return moments.filter((moment) => moment.type === "caption" || moment.type === "title").map((moment, index) => {
      return {
        id: safeMomentLabel(moment, index),
        momentType: moment.type,
        speakerRole: moment.speakerRole || "All speakers",
        speakerName: moment.speakerName || moment.speakerRole || "All speakers",
        time: moment.time || "0:00",
        originalText: trim(moment.text) || "",
        correctedText: trim(moment.text) || "",
      };
    });
  }

  function correctionPairs(review) {
    const rows = review && Array.isArray(review.speakers) ? review.speakers : [];
    const pairs = [];
    rows.forEach((speaker) => {
      if (speaker.speakerName && speaker.speakerNameCorrected && speaker.speakerNameCorrected !== speaker.speakerName) {
        pairs.push({
          from: speaker.speakerName,
          to: speaker.speakerNameCorrected,
        });
      }
      if (speaker.brand && speaker.brandCorrected && speaker.brandCorrected !== speaker.brand) {
        pairs.push({
          from: speaker.brand,
          to: speaker.brandCorrected,
        });
      }
      const fromTopics = splitList(speaker.topics);
      const toTopics = splitList(speaker.topicsCorrected);
      const max = Math.max(fromTopics.length, toTopics.length);
      for (let index = 0; index < max; index += 1) {
        const from = trim(fromTopics[index]);
        const to = trim(toTopics[index]);
        if (!from || !to || from === to) {
          continue;
        }
        pairs.push({ from, to });
      }
    });
    return pairs;
  }

  function createReview(summary, board) {
    const episode = summary || {};
    return {
      episodeName: trim(episode.episodeName),
      approved: false,
      approvedAt: null,
      speakers: speakerCorrectionRows(episode),
      correctedMoments: momentCorrectionRows(board),
    };
  }

  function updateSpeaker(review, index, patch) {
    const next = clone(review || createReview({}, {}));
    if (!Array.isArray(next.speakers) || index < 0 || index >= next.speakers.length) {
      return next;
    }
    const current = next.speakers[index];
    const changes = patch || {};
    const updated = Object.assign({}, current);
    if (changes.speakerNameCorrected != null) {
      updated.speakerNameCorrected = trim(changes.speakerNameCorrected) || updated.speakerName;
    }
    if (changes.brandCorrected != null) {
      updated.brandCorrected = trim(changes.brandCorrected) || "";
    }
    if (changes.topics != null) {
      updated.topics = splitList(changes.topics);
    }
    if (changes.topicsCorrected != null) {
      updated.topicsCorrected = splitList(changes.topicsCorrected);
    }
    next.speakers[index] = updated;
    return next;
  }

  function updateMomentText(review, momentId, value) {
    const next = clone(review || createReview({}, {}));
    if (!Array.isArray(next.correctedMoments)) {
      next.correctedMoments = [];
    }
    const id = String(momentId == null ? "" : momentId);
    const index = next.correctedMoments.findIndex((moment) => moment.id === id);
    if (index >= 0) {
      next.correctedMoments[index].correctedText = trim(value);
      return next;
    }
    next.correctedMoments.push({
      id,
      momentType: "caption",
      speakerRole: "Unknown",
      speakerName: "",
      time: "",
      originalText: "",
      correctedText: trim(value),
    });
    return next;
  }

  function correctedTextForMoment(review, moment) {
    const moments = review && Array.isArray(review.correctedMoments) ? review.correctedMoments : [];
    const match = moments.find((entry) => entry.id === (moment && moment.id));
    return match && typeof match.correctedText === "string"
      ? match.correctedText
      : moment && typeof moment.text === "string"
        ? moment.text
        : "";
  }

  function correctedSpeakerName(review, speakerRole, speakerName) {
    const speaker = findSpeaker(review, speakerRole, speakerName);
    if (!speaker) {
      return speakerName || "";
    }
    return trim(speaker.speakerNameCorrected) || trim(speaker.speakerName);
  }

  function applyReviewToTranscript(review, board) {
    const base = board && typeof board === "object" ? clone(board) : { transcript: [] };
    const replacements = correctionPairs(review);
    base.transcript = Array.isArray(base.transcript)
      ? base.transcript.map((segment) => {
        if (!segment || typeof segment !== "object") {
          return segment;
        }
        const next = Object.assign({}, segment);
        next.speakerName = applyReplacements(correctedSpeakerName(review, segment.speakerRole, segment.speakerName), replacements);
        return next;
      })
      : [];
    return base;
  }

  function applyReviewToMoments(review, board) {
    const base = board && typeof board === "object" ? clone(board) : { moments: [] };
    const replacements = correctionPairs(review);
    base.moments = Array.isArray(base.moments)
      ? base.moments.map((moment) => {
        if (!moment || typeof moment !== "object") {
          return moment;
        }
        const next = Object.assign({}, moment);
        next.speakerName = correctedSpeakerName(review, moment.speakerRole, moment.speakerName);
        const corrected = correctedTextForMoment(review, moment);
        next.text = applyReplacements(
          applyReplacements(corrected, replacements),
          review && review.extraReplacements,
        );
        return next;
      })
      : [];
    return base;
  }

  function applyReviewToPackage(review, packageState) {
    const next = clone(packageState || {});
    if (!next || !review || !review.approved) {
      return next;
    }
    const replacements = correctionPairs(review);
    const apply = (text) => applyReplacements(text, replacements);
    if (next.title) {
      next.title = apply(next.title);
    }
    if (next.description) {
      next.description = apply(next.description);
    }
    if (next.credits) {
      next.credits = apply(next.credits);
    }
    if (Array.isArray(next.chapters)) {
      next.chapters = next.chapters.map((chapter) => {
        if (!chapter || typeof chapter !== "object") {
          return chapter;
        }
        return Object.assign({}, chapter, {
          title: chapter.title ? apply(chapter.title) : chapter.title,
          time: chapter.time || chapter.time === "0:00" ? chapter.time : chapter.time,
        });
      });
    }
    return next;
  }

  function approveReview(review) {
    const next = clone(review || createReview({}, {}));
    const speakers = Array.isArray(next.speakers) ? next.speakers : [];
    speakers.forEach((speaker) => {
      speaker.speakerName = trim(speaker.speakerName);
      speaker.speakerNameCorrected = speaker.speakerNameCorrected
        ? trim(speaker.speakerNameCorrected)
        : speaker.speakerName;
      speaker.brand = speaker.brand || "";
      speaker.brandCorrected = speaker.brandCorrected || "";
      speaker.topics = splitList(speaker.topics);
      speaker.topicsCorrected = splitList(speaker.topicsCorrected);
    });
    return {
      speakers: speakers,
      correctedMoments: Array.isArray(next.correctedMoments) ? next.correctedMoments : [],
      extraReplacements: Array.isArray(next.extraReplacements) ? next.extraReplacements : [],
      episodeName: trim(next.episodeName),
      approved: true,
      approvedAt: Date.now(),
    };
  }

  function summarizeReview(review) {
    const speakers = review && Array.isArray(review.speakers) ? review.speakers : [];
    const updated = speakers.filter((speaker) => (speaker.speakerNameCorrected || "").trim() !== (speaker.speakerName || "").trim()).length;
    const momentCount = review && Array.isArray(review.correctedMoments) ? review.correctedMoments.length : 0;
    return {
      approved: Boolean(review && review.approved),
      speakerCorrectionCount: updated,
      momentCorrectionCount: momentCount,
      reviewLine: review && review.approved
        ? `Transcript and captions reviewed: ${updated} speaker change${updated === 1 ? "" : "s"}, ${momentCount} moment text item${momentCount === 1 ? "" : "s"}`
        : "",
    };
  }

  function serializeReview(review) {
    return JSON.stringify(review || createReview({}, {}));
  }

  function deserializeReview(json, summary, board) {
    if (!json) {
      return createReview(summary || {}, board);
    }
    try {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.speakers)) {
        return createReview(summary || {}, board);
      }
      return parsed;
    } catch (err) {
      return createReview(summary || {}, board);
    }
  }

  const api = {
    createReview,
    updateSpeaker,
    updateMomentText,
    applyReviewToTranscript,
    applyReviewToMoments,
    applyReviewToPackage,
    approveReview,
    summarizeReview,
    serializeReview,
    deserializeReview,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcTranscriptCorrections = api;
}(typeof window !== "undefined" ? window : globalThis));

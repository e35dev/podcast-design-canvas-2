"use strict";

// Transcript & caption correction model for Podcast Design Canvas (#63).
//
// A creator-facing accuracy pass before publishing: fix speaker labels, brand/term
// spellings, and the wording of key caption/title lines once, then have those corrections
// carry through every visible and publishable output — on-screen captions, visual moment
// title cards, export metadata, and publish package copy. DOM-free so the review screen,
// the export summary, and the tests share one source of truth. No build, no dependencies.
(function (global) {
  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Replace every occurrence of `from` with `to`, case-insensitively, leaving text intact
  // when either side is empty or unchanged.
  function replaceTerm(text, from, to) {
    const find = trim(from);
    const repl = typeof to === "string" ? to : "";
    if (!find || find === repl) {
      return text;
    }
    return String(text == null ? "" : text).replace(new RegExp(escapeRegExp(find), "gi"), repl);
  }

  function defaultName(speaker, index) {
    return trim(speaker && speaker.name) || trim(speaker && speaker.role) || `Speaker ${index + 1}`;
  }

  // Pull term seeds (likely-misspelling → correct spelling/brand) from an optional social
  // context review, so the transcript pass starts from what social research already learned.
  function buildTermSeeds(socialReview) {
    const review = socialReview && typeof socialReview === "object" ? socialReview : null;
    const speakers = review && Array.isArray(review.speakers) ? review.speakers : [];
    const seeds = [];
    const seen = {};
    speakers.forEach((sp) => {
      const correct = trim(sp.displayName) || trim(sp.name);
      const hints = Array.isArray(sp.spellingHints) ? sp.spellingHints : [];
      hints.forEach((hint) => {
        const from = trim(hint);
        if (from && correct && from.toLowerCase() !== correct.toLowerCase() && !seen[from.toLowerCase()]) {
          seen[from.toLowerCase()] = true;
          seeds.push({ from, to: correct });
        }
      });
    });
    return seeds;
  }

  // Seed the editable line list from real on-screen moments (captions + title cards) so the
  // creator is correcting the actual wording viewers will see.
  function buildLineSeeds(moments, labels) {
    const list = Array.isArray(moments) ? moments : [];
    return list
      .filter((moment) => moment && (moment.type === "caption" || moment.type === "title"))
      .map((moment) => {
        const role = trim(moment.speakerRole);
        const label = labels.find((entry) => entry.role === role);
        return {
          id: typeof moment.id === "string" ? moment.id : "",
          kind: moment.type,
          speakerRole: role,
          speakerName: label ? label.name : trim(moment.speakerName),
          original: trim(moment.text),
          text: trim(moment.text),
        };
      })
      .filter((line) => line.id);
  }

  // Build the review from the episode (speakers) and optional social context + moments.
  function createReview(episodeSummary, options) {
    const episode = episodeSummary || {};
    const opts = options || {};
    const speakers = Array.isArray(episode.speakers) ? episode.speakers : [];
    const labels = speakers.map((sp, index) => {
      const name = defaultName(sp, index);
      return { role: trim(sp.role) || `Speaker ${index + 1}`, original: name, name };
    });
    return {
      speakerLabels: labels,
      terms: buildTermSeeds(opts.socialReview),
      lines: buildLineSeeds(opts.moments, labels),
      approved: false,
    };
  }

  function updateSpeakerLabel(review, role, name) {
    const next = clone(review || createReview({}));
    next.speakerLabels = (next.speakerLabels || []).map((label) =>
      label.role === role ? Object.assign({}, label, { name: trim(name) || label.original }) : label,
    );
    next.approved = false;
    return next;
  }

  function updateLine(review, id, text) {
    const next = clone(review || createReview({}));
    next.lines = (next.lines || []).map((line) =>
      line.id === id ? Object.assign({}, line, { text: typeof text === "string" ? text : "" }) : line,
    );
    next.approved = false;
    return next;
  }

  function addTerm(review, from, to) {
    const next = clone(review || createReview({}));
    if (trim(from)) {
      next.terms = (next.terms || []).concat({ from: trim(from), to: trim(to) });
      next.approved = false;
    }
    return next;
  }

  function updateTerm(review, index, changes) {
    const next = clone(review || createReview({}));
    const patch = changes || {};
    next.terms = (next.terms || []).map((term, i) => {
      if (i !== index) {
        return term;
      }
      return {
        from: Object.prototype.hasOwnProperty.call(patch, "from") ? trim(patch.from) : term.from,
        to: Object.prototype.hasOwnProperty.call(patch, "to") ? trim(patch.to) : term.to,
      };
    });
    next.approved = false;
    return next;
  }

  function removeTerm(review, index) {
    const next = clone(review || createReview({}));
    next.terms = (next.terms || []).filter((term, i) => i !== index);
    next.approved = false;
    return next;
  }

  function approveReview(review) {
    const next = clone(review || createReview({}));
    next.approved = true;
    return next;
  }

  // Apply every correction to a free-text string: fix term/spelling wording first (so a
  // misspelled name becomes its setup spelling), then apply any speaker-label rename on top.
  // This is the one place the rules live.
  function correctText(text, review) {
    const data = review || {};
    let out = String(text == null ? "" : text);
    (data.terms || []).forEach((term) => {
      out = replaceTerm(out, term.from, term.to);
    });
    (data.speakerLabels || []).forEach((label) => {
      out = replaceTerm(out, label.original, label.name);
    });
    return out;
  }

  function labelForRole(review, role) {
    const data = review || {};
    const found = (data.speakerLabels || []).find((label) => label.role === role);
    return found ? found.name : "";
  }

  // Apply corrections to a moments array: an edited line replaces that moment's text; every
  // moment also gets term/label corrections and an updated speaker name. Returns a plain
  // corrected array (the UI writes these back onto the visual-moments board).
  function applyToMoments(moments, review) {
    const list = Array.isArray(moments) ? moments : [];
    const data = review || {};
    const lineById = {};
    (data.lines || []).forEach((line) => {
      lineById[line.id] = line;
    });
    return list.map((moment) => {
      const corrected = clone(moment);
      const editedLine = lineById[moment.id];
      const baseText = editedLine ? editedLine.text : moment.text;
      corrected.text = correctText(baseText, data);
      const role = trim(moment.speakerRole);
      const newName = labelForRole(data, role);
      if (newName) {
        corrected.speakerName = newName;
      }
      return corrected;
    });
  }

  function correctCredit(credit, data) {
    const corrected = Object.assign({}, credit);
    const byRole = labelForRole(data, trim(credit.role));
    corrected.name = byRole || correctText(credit.name || "", data);
    if (typeof corrected.creditLine === "string") {
      corrected.creditLine = correctText(corrected.creditLine, data);
    }
    if (typeof corrected.note === "string") {
      corrected.note = correctText(corrected.note, data);
    }
    return corrected;
  }

  // Apply corrections to the publish package copy: title, description, and speaker credits.
  // Handles the publish package's `speakerCredits` shape (and a plain `credits` array).
  function applyToPublishPackage(pkg, review) {
    const data = review || {};
    const next = clone(pkg || {});
    if (typeof next.title === "string") {
      next.title = correctText(next.title, data);
    }
    if (typeof next.description === "string") {
      next.description = correctText(next.description, data);
    }
    if (Array.isArray(next.speakerCredits)) {
      next.speakerCredits = next.speakerCredits.map((credit) => correctCredit(credit, data));
    }
    if (Array.isArray(next.credits)) {
      next.credits = next.credits.map((credit) => correctCredit(credit, data));
    }
    return next;
  }

  function correctedSpeakers(review) {
    const data = review || {};
    return (data.speakerLabels || []).map((label) => ({
      role: label.role,
      name: label.name,
      renamed: trim(label.name) !== trim(label.original),
    }));
  }

  // Roll up for the workspace and, via the export context, the final export metadata.
  function summarizeReview(review) {
    const data = review || {};
    const labels = data.speakerLabels || [];
    const renamed = labels.filter((label) => trim(label.name) !== trim(label.original)).length;
    const editedLines = (data.lines || []).filter((line) => trim(line.text) !== trim(line.original)).length;
    const termCount = (data.terms || []).filter((term) => trim(term.from)).length;
    const parts = [];
    parts.push(`${labels.length} speaker${labels.length === 1 ? "" : "s"}`);
    if (renamed) {
      parts.push(`${renamed} name fix${renamed === 1 ? "" : "es"}`);
    }
    if (editedLines) {
      parts.push(`${editedLines} caption edit${editedLines === 1 ? "" : "s"}`);
    }
    if (termCount) {
      parts.push(`${termCount} term${termCount === 1 ? "" : "s"}`);
    }
    return {
      approved: Boolean(data.approved),
      speakerCount: labels.length,
      renamedCount: renamed,
      editedLineCount: editedLines,
      termCount,
      lineCount: (data.lines || []).length,
      correctedSpeakers: correctedSpeakers(data),
      reviewLine: data.approved
        ? `Transcript reviewed: ${parts.join(" · ")}`
        : "",
    };
  }

  function serializeReview(review) {
    return JSON.stringify(review || null);
  }

  function deserializeReview(json) {
    if (!json) {
      return null;
    }
    try {
      const parsed = typeof json === "string" ? JSON.parse(json) : json;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return {
        speakerLabels: Array.isArray(parsed.speakerLabels)
          ? parsed.speakerLabels.map((label) => ({
              role: trim(label.role),
              original: trim(label.original) || trim(label.name),
              name: trim(label.name) || trim(label.original),
            }))
          : [],
        terms: Array.isArray(parsed.terms)
          ? parsed.terms.map((term) => ({ from: trim(term.from), to: trim(term.to) }))
          : [],
        lines: Array.isArray(parsed.lines)
          ? parsed.lines.map((line) => ({
              id: trim(line.id),
              kind: trim(line.kind) || "caption",
              speakerRole: trim(line.speakerRole),
              speakerName: trim(line.speakerName),
              original: trim(line.original),
              text: typeof line.text === "string" ? line.text : trim(line.original),
            }))
          : [],
        approved: Boolean(parsed.approved),
      };
    } catch (err) {
      return null;
    }
  }

  const api = {
    createReview,
    updateSpeakerLabel,
    updateLine,
    addTerm,
    updateTerm,
    removeTerm,
    approveReview,
    correctText,
    labelForRole,
    applyToMoments,
    applyToPublishPackage,
    correctedSpeakers,
    summarizeReview,
    serializeReview,
    deserializeReview,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcTranscriptCorrection = api;
}(typeof window !== "undefined" ? window : globalThis));

"use strict";

// Transcript and caption correction for Podcast Design Canvas (#63).
//
// Creator-facing review of generated transcript lines, speaker labels, and on-screen
// caption/title text before export. Corrections flow through visual moments, publish
// package copy, export metadata, and canvas text. DOM-free for tests and UI.
(function (global) {
  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function socialApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./social-context.js");
    }
    return (typeof window !== "undefined" ? window : globalThis).PdcSocialContext;
  }

  function momentsApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./visual-moments.js");
    }
    return (typeof window !== "undefined" ? window : globalThis).PdcVisualMoments;
  }

  function publishApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./publish-package.js");
    }
    return (typeof window !== "undefined" ? window : globalThis).PdcPublishPackage;
  }

  function defaultTranscriptText(segment, socialCtx) {
    const name = (segment && segment.speakerName) || "Speaker";
    const brand = socialCtx && socialCtx.brand ? socialCtx.brand : "the episode topic";
    const topic = socialCtx && socialCtx.topics && socialCtx.topics[0] ? socialCtx.topics[0] : "the conversation";
    return `${name} discusses ${topic} and how ${brand} fits into the story at ${segment.time}.`;
  }

  function findSocialSpeaker(socialReview, role, name) {
    const SC = socialApi();
    if (!SC || !socialReview) {
      return null;
    }
    return SC.findSpeakerContext(socialReview, role, name);
  }

  function createReview(episodeSummary, socialReview, momentsBoard) {
    const episode = episodeSummary || {};
    const VM = momentsApi();
    const board = momentsBoard || (VM ? VM.createBoard(episode) : { transcript: [], moments: [] });
    const lines = [];

    (board.transcript || []).forEach((segment, index) => {
      const ctx = findSocialSpeaker(socialReview, segment.speakerRole, segment.speakerName);
      lines.push({
        id: `line-transcript-${index}`,
        kind: "transcript",
        time: segment.time,
        speakerRole: segment.speakerRole,
        speakerName: segment.speakerName,
        text: defaultTranscriptText(segment, ctx),
      });
    });

    if (VM) {
      VM.listMoments(board)
        .filter((moment) => moment.type === "caption" || moment.type === "title")
        .forEach((moment) => {
          lines.push({
            id: `line-moment-${moment.id}`,
            kind: moment.type,
            momentId: moment.id,
            time: moment.time,
            speakerRole: moment.speakerRole,
            speakerName: moment.speakerName,
            text: moment.text,
          });
        });
    }

    return {
      episodeName: trim(episode.episodeName),
      approved: false,
      lines: lines,
    };
  }

  function updateLine(review, lineId, patch) {
    const next = clone(review || { lines: [], approved: false });
    const changes = patch || {};
    next.lines = (next.lines || []).map((line) => {
      if (line.id !== lineId) {
        return line;
      }
      const updated = Object.assign({}, line);
      if (changes.text != null) {
        updated.text = trim(changes.text);
      }
      if (changes.speakerRole != null) {
        updated.speakerRole = trim(changes.speakerRole);
      }
      if (changes.speakerName != null) {
        updated.speakerName = trim(changes.speakerName);
      }
      return updated;
    });
    next.approved = false;
    return next;
  }

  function approveReview(review) {
    const next = clone(review || { lines: [] });
    next.approved = (next.lines || []).length > 0;
    return next;
  }

  function speakerNameMap(lines) {
    const map = {};
    (lines || []).forEach((line) => {
      if (line.speakerRole && line.speakerName) {
        map[line.speakerRole] = line.speakerName;
      }
    });
    return map;
  }

  function applyToEpisodeSummary(episodeSummary, lines) {
    const episode = clone(episodeSummary || {});
    const names = speakerNameMap(lines);
    episode.speakers = (episode.speakers || []).map((speaker) => {
      const next = Object.assign({}, speaker);
      if (names[speaker.role]) {
        next.name = names[speaker.role];
      }
      return next;
    });
    return episode;
  }

  function applyToMomentsBoard(momentsBoard, lines) {
    const VM = momentsApi();
    if (!VM || !momentsBoard) {
      return momentsBoard;
    }
    let board = clone(momentsBoard);
    (lines || []).forEach((line) => {
      if (!line.momentId) {
        return;
      }
      board = VM.updateMoment(board, line.momentId, {
        text: line.text,
        speakerRole: line.speakerRole,
        speakerName: line.speakerName,
      });
    });
    return board;
  }

  function applyToPublishPackage(publishPackage, episodeSummary, lines) {
    const PP = publishApi();
    if (!PP || !publishPackage) {
      return publishPackage;
    }
    let pkg = clone(publishPackage);
    const episode = applyToEpisodeSummary(episodeSummary, lines);
    const names = (episode.speakers || []).map((speaker) => speaker.name).filter(Boolean);
    const captionLines = (lines || []).filter((line) => line.kind === "caption").map((line) => line.text);
    const descriptionParts = [
      trim(pkg.description).split(".")[0] || trim(episode.episodeName),
      names.length ? `Featuring ${names.join(", ")}.` : "",
      captionLines.length ? `Captions include: ${captionLines.slice(0, 2).join("; ")}.` : "",
    ].filter(Boolean);
    pkg = PP.updatePackage(pkg, { description: descriptionParts.join(" ") });

    (episode.speakers || []).forEach((speaker, index) => {
      const creditId = `credit-${index + 1}`;
      pkg = PP.updateSpeakerCredit(pkg, creditId, {
        name: speaker.name,
        role: speaker.role,
      });
    });

    (lines || []).forEach((line) => {
      if (line.kind === "title" && line.momentId) {
        pkg = PP.updateChapter(pkg, line.momentId, { label: line.text, time: line.time });
      }
    });

    return pkg;
  }

  function applyToCanvas(canvasDoc, lines) {
    const doc = clone(canvasDoc || {});
    const titleLine = (lines || []).find((line) => line.kind === "title");
    const captionLine = (lines || []).find((line) => line.kind === "caption");
    if (titleLine && titleLine.text) {
      doc.titleText = titleLine.text;
    }
    if (captionLine && captionLine.text) {
      doc.captionText = captionLine.text;
    }
    if (Array.isArray(doc.speakerFrames)) {
      const names = speakerNameMap(lines);
      doc.speakerFrames = doc.speakerFrames.map((frame) => {
        if (names[frame.role]) {
          return Object.assign({}, frame, { name: names[frame.role] });
        }
        return frame;
      });
    }
    return doc;
  }

  function applyCorrections(review, targets) {
    const r = review || { lines: [] };
    const bundle = targets || {};
    const lines = r.lines || [];
    const episodeSummary = applyToEpisodeSummary(bundle.episodeSummary, lines);
    const momentsBoard = applyToMomentsBoard(bundle.momentsBoard, lines);
    const publishPackage = applyToPublishPackage(bundle.publishPackage, bundle.episodeSummary, lines);
    const canvasDoc = bundle.canvasDoc ? applyToCanvas(bundle.canvasDoc, lines) : bundle.canvasDoc;
    const correctedCount = lines.filter((line) => trim(line.text)).length;

    return {
      episodeSummary: episodeSummary,
      momentsBoard: momentsBoard,
      publishPackage: publishPackage,
      canvasDoc: canvasDoc,
      exportLines: [
        `Transcript review: ${correctedCount} line${correctedCount === 1 ? "" : "s"} corrected before export`,
      ],
      reviewLine: correctedCount
        ? `Transcript corrections applied across captions, credits, and publish copy`
        : "",
    };
  }

  function summarizeReview(review) {
    const r = review || {};
    const lines = r.lines || [];
    return {
      lineCount: lines.length,
      approved: Boolean(r.approved),
      summaryLine: lines.length
        ? `${lines.length} transcript and caption line${lines.length === 1 ? "" : "s"} ready for review`
        : "Add speakers to generate a transcript review",
      workspaceLine: r.approved
        ? "Transcript and captions corrected for export"
        : "Review transcript spelling and caption text before publishing",
    };
  }

  const api = {
    createReview,
    updateLine,
    approveReview,
    applyCorrections,
    applyToEpisodeSummary,
    applyToMomentsBoard,
    applyToPublishPackage,
    applyToCanvas,
    summarizeReview,
    defaultTranscriptText,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcTranscriptCorrection = api;
}(typeof window !== "undefined" ? window : globalThis));

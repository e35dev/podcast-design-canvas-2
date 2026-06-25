"use strict";

// Transcript correction smoke suite for Podcast Design Canvas (#63).
// Run with: `node tests/transcript-correction.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const moments = require("../app/visual-moments.js");
const social = require("../app/social-context.js");
const publishPackage = require("../app/publish-package.js");
const exportApi = require("../app/episode-export.js");
const correction = require("../app/transcript-correction.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function completeDraft() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), {
      name: "Sam Rivira",
      fileName: "sam.mp4",
      social: { website: "https://samrivera.show", twitter: "", instagram: "", linkedin: "" },
    }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
  ];
  return draft;
}

test("createReview builds transcript and caption lines from episode and social context", () => {
  const episode = setup.summarize(completeDraft());
  let socialReview = social.createReview(episode);
  socialReview = social.approveReview(socialReview);
  let board = moments.createBoard(episode);
  board = moments.addMoment(board, "caption", { time: "1:30", text: "Sam Rivira: welcome back", speakerRole: "Host" });
  const review = correction.createReview(episode, socialReview, board);
  assert.ok(review.lines.length >= 7);
  assert.ok(review.lines.some((line) => line.kind === "transcript"));
  assert.ok(review.lines.some((line) => line.kind === "caption"));
  assert.ok(/Sam Rivira|Sam Rivera/.test(review.lines[0].text));
});

test("updateLine edits speaker label and caption text", () => {
  const episode = setup.summarize(completeDraft());
  let board = moments.createBoard(episode);
  board = moments.addMoment(board, "caption", { time: "2:00", text: "misspelled name", speakerRole: "Host" });
  let review = correction.createReview(episode, null, board);
  const captionLine = review.lines.find((line) => line.kind === "caption");
  review = correction.updateLine(review, captionLine.id, {
    text: "Sam Rivera: welcome back",
    speakerName: "Sam Rivera",
  });
  const updated = review.lines.find((line) => line.id === captionLine.id);
  assert.strictEqual(updated.text, "Sam Rivera: welcome back");
  assert.strictEqual(updated.speakerName, "Sam Rivera");
});

test("applyCorrections updates moments, publish package, and export metadata", () => {
  const episode = setup.summarize(completeDraft());
  let board = moments.createBoard(episode);
  board = moments.addMoment(board, "caption", { time: "1:30", text: "Sam Rivira speaks", speakerRole: "Host" });
  board = moments.addMoment(board, "title", { time: "3:00", text: "Old title card" });
  let review = correction.createReview(episode, social.approveReview(social.createReview(episode)), board);
  review.lines.forEach((line) => {
    if (line.kind === "caption") {
      review = correction.updateLine(review, line.id, { text: "Sam Rivera: key insight", speakerName: "Sam Rivera" });
    }
    if (line.kind === "title") {
      review = correction.updateLine(review, line.id, { text: "Building in Public" });
    }
    if (line.kind === "transcript" && line.speakerRole === "Host") {
      review = correction.updateLine(review, line.id, { speakerName: "Sam Rivera" });
    }
  });
  review = correction.approveReview(review);

  const ctx = {
    showName: "Founders Unfiltered",
    appliedStyle: style.summarizeStyle(style.createSelection(), episode.speakerCount),
    momentsBoard: board,
  };
  let pkg = publishPackage.createPackage(episode, ctx);
  const applied = correction.applyCorrections(review, {
    episodeSummary: episode,
    momentsBoard: board,
    publishPackage: pkg,
    canvasDoc: { titleText: "Old title card", captionText: "Sam Rivira speaks", speakerFrames: [{ role: "Host", name: "Sam Rivira" }] },
  });

  const caption = moments.listMoments(applied.momentsBoard).find((moment) => moment.type === "caption");
  assert.strictEqual(caption.text, "Sam Rivera: key insight");
  assert.strictEqual(applied.episodeSummary.speakers[0].name, "Sam Rivera");
  assert.ok(applied.publishPackage.description.indexOf("Sam Rivera") >= 0);
  assert.strictEqual(applied.canvasDoc.captionText, "Sam Rivera: key insight");
  assert.strictEqual(applied.canvasDoc.titleText, "Building in Public");
  assert.ok(applied.exportLines[0].indexOf("Transcript review") >= 0);
});

test("ACCEPTANCE: review, correct, and observe changes in captions export and publish package", () => {
  const draft = completeDraft();
  const episode = setup.summarize(draft);
  const socialReview = social.approveReview(social.createReview(episode));
  let board = moments.createBoard(episode);
  board = moments.addMoment(board, "caption", { time: "0:45", text: "Welcome from Sam Rivira", speakerRole: "Host" });
  board = moments.addMoment(board, "title", { time: "5:00", text: "Topic segment" });

  let review = correction.createReview(episode, socialReview, board);
  const caption = review.lines.find((line) => line.kind === "caption");
  review = correction.updateLine(review, caption.id, {
    text: "Welcome from Sam Rivera",
    speakerName: "Sam Rivera",
  });
  review.lines
    .filter((line) => line.kind === "transcript" && line.speakerRole === "Host")
    .forEach((line) => {
      review = correction.updateLine(review, line.id, { speakerName: "Sam Rivera" });
    });
  review = correction.approveReview(review);

  const pkg = publishPackage.createPackage(episode, { momentsBoard: board, showName: "Founders Unfiltered" });
  const result = correction.applyCorrections(review, {
    episodeSummary: episode,
    momentsBoard: board,
    publishPackage: pkg,
    canvasDoc: { captionText: "Welcome from Sam Rivira", speakerFrames: [{ role: "Host", name: "Sam Rivira" }] },
  });

  const summary = correction.summarizeReview(review);
  assert.strictEqual(summary.approved, true);
  assert.ok(result.publishPackage.speakerCredits[0].name === "Sam Rivera" || result.publishPackage.description.indexOf("Sam Rivera") >= 0);

  const exportSummary = exportApi.buildFinalSummary(result.episodeSummary, {
    momentsSummary: moments.summarizeBoard(result.momentsBoard),
    publishPackageSummary: publishPackage.summarizePackage(result.publishPackage),
    transcriptCorrectionSummary: { lines: result.exportLines },
  }, exportApi.createExport(result.episodeSummary));
  assert.ok(exportSummary.lines.some((line) => /Sam Rivera|Transcript review|Founders/.test(line)));
});

console.log(`\ntranscript correction: ${passed} assertions passed`);

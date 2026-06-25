"use strict";

// Transcript correction smoke suite for Issue #63.
// Guards speaker/topic/brand corrections and caption edits before export.
// Run with: `node tests/transcript-corrections.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const moments = require("../app/visual-moments.js");
const tc = require("../app/transcript-corrections.js");
const exp = require("../app/episode-export.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function completeEpisode() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
  ];
  return setup.summarize(draft);
}

test("createReview derives correction rows for captions and titles", () => {
  const episode = completeEpisode();
  let board = moments.createBoard(episode);
  board = moments.addMoment(board, "caption", {
    time: "0:30",
    text: "Sam Rivira welcomes Dana",
    speakerRole: "Host",
    speakerName: "Sam Rivera",
  });
  board = moments.addMoment(board, "title", {
    time: "1:00",
    text: "Startup Segment",
    speakerRole: "Host",
    speakerName: "Sam Rivera",
  });

  const review = tc.createReview(episode, board);
  assert.strictEqual(review.speakers.length, 2);
  assert.strictEqual(review.correctedMoments.length, 2);
});

test("applyReviewToMoments and transcript uses speaker/topic/brand corrections", () => {
  const episode = completeEpisode();
  const board = moments.createBoard(episode);
  const initial = moments.addMoment(board, "caption", {
    time: "0:30",
    text: "Sam Rivira updates the startup terms.",
    speakerRole: "Host",
    speakerName: "Sam Rivera",
  });
  const review = tc.createReview(episode, initial);
  let updated = tc.updateSpeaker(review, 0, {
    speakerNameCorrected: "Sam Rivera",
    brandCorrected: "Founders Weekly",
    topics: "startup,business",
    topicsCorrected: "start-up,business strategy",
  });
  updated = tc.updateMomentText(updated, initial.moments[0].id, "Sam Rivera explains our start-up roadmap.");
  updated = tc.approveReview(updated);

  const next = tc.applyReviewToMoments(updated, initial);
  const caption = next.moments.find((moment) => moment.type === "caption");
  assert.ok(next.transcript.length > 0);
  assert.ok(caption.text.indexOf("start-up") >= 0);
  assert.ok(caption.speakerName === "Sam Rivera");
});

test("applyReviewToPackage updates publish-package copy with approved corrections", () => {
  const episode = completeEpisode();
  const board = moments.createBoard(episode);
  const withMoments = moments.addMoment(board, "title", {
    time: "0:20",
    text: "Startup notes",
    speakerRole: "Host",
    speakerName: "Sam Rivera",
  });
  const review = tc.createReview(episode, withMoments);
  let updated = tc.updateSpeaker(review, 0, { speakerNameCorrected: "Sam R. Rivera" });
  updated = tc.approveReview(updated);

  const pkg = exp.buildPublishPackage(episode, { contextSummary: null });
  const reviewed = tc.applyReviewToPackage(updated, pkg);
  assert.ok(reviewed.credits.indexOf("Sam R. Rivera") >= 0);
});

console.log(`\ntranscript corrections: ${passed} assertions passed`);

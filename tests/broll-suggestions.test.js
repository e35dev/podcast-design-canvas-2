"use strict";

// Smart b-roll suggestions smoke suite for Podcast Design Canvas (#67).
// Run with: `node tests/broll-suggestions.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const audio = require("../app/audio-polish.js");
const moments = require("../app/visual-moments.js");
const context = require("../app/social-context.js");
const correction = require("../app/transcript-correction.js");
const exportApi = require("../app/episode-export.js");
const broll = require("../app/broll-suggestions.js");

let passed = 0;
function test(name, fn) {
  broll._resetCounter();
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function draftWithSocial() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), {
      name: "Sam Rivera",
      fileName: "sam.mp4",
      social: { website: "https://samrivera.show", twitter: "https://x.com/samrivera" },
    }),
    Object.assign(setup.createSpeaker("Guest 1"), {
      name: "Dana Kim",
      fileName: "dana.mp4",
      social: { linkedin: "https://linkedin.com/in/danakim" },
    }),
  ];
  return draft;
}

function buildBoard(episode) {
  let board = moments.createBoard(episode);
  board = moments.addMoment(board, "caption", {
    time: "1:00",
    text: "Welcome back, this is Sam Rivira",
    speakerRole: "Host",
    speakerName: "Sam Rivera",
  });
  board = moments.addMoment(board, "title", {
    time: "2:30",
    text: "Building in public",
    speakerRole: "Host",
    speakerName: "Sam Rivera",
  });
  return board;
}

function buildCorrection(episode, board) {
  const contextReview = context.approveReview(context.updateSpeaker(context.createReview(episode), 0, {
    displayName: "Sam R. Rivera",
    brand: "Rivera Media",
    spellingHints: "Sam Rivira",
  }));
  let review = correction.createCorrectionReview(episode, {
    contextReview: contextReview,
    momentsBoard: board,
  });
  review = correction.updateSpeaker(review, "Host", {
    label: "Sam R. Rivera",
    brand: "Rivera Media",
    topicTerms: ["founders", "SaaS"],
  });
  review = correction.approveCorrection(review);
  return review;
}

test("generate creates plain-language suggestions from transcript and social context", () => {
  const episode = setup.summarize(draftWithSocial());
  const board = buildBoard(episode);
  const review = buildCorrection(episode, board);
  let session = broll.createSession(episode);
  session = broll.generate(session, episode, review, board);

  assert.strictEqual(session.generated, true);
  assert.ok(session.suggestions.length >= 2);
  const logo = session.suggestions.find((item) => item.assetType === broll.ASSET_TYPES.LOGO);
  assert.ok(logo);
  assert.ok(/Rivera Media/.test(logo.reason));
  assert.strictEqual(logo.status, broll.STATUS.PENDING);
});

test("accept and skip update suggestion status", () => {
  const episode = setup.summarize(draftWithSocial());
  const board = buildBoard(episode);
  const review = buildCorrection(episode, board);
  let session = broll.generate(broll.createSession(episode), episode, review, board);
  const first = session.suggestions[0];
  const second = session.suggestions[1];

  session = broll.acceptSuggestion(session, first.id);
  session = broll.skipSuggestion(session, second.id);

  assert.strictEqual(session.suggestions.find((item) => item.id === first.id).status, broll.STATUS.ACCEPTED);
  assert.strictEqual(session.suggestions.find((item) => item.id === second.id).status, broll.STATUS.SKIPPED);
});

test("applyToBoard adds accepted b-roll moments to the visual moments board", () => {
  const episode = setup.summarize(draftWithSocial());
  let board = buildBoard(episode);
  const review = buildCorrection(episode, board);
  let session = broll.generate(broll.createSession(episode), episode, review, board);
  session = broll.acceptSuggestion(session, session.suggestions[0].id);

  const applied = broll.applyToBoard(board, session);
  board = applied.board;
  session = applied.session;

  const brollMoments = moments.listMoments(board).filter((moment) => moment.type === "broll");
  assert.strictEqual(brollMoments.length, 1);
  assert.ok(brollMoments[0].text);
  assert.ok(session.suggestions.find((item) => item.status === broll.STATUS.ACCEPTED).momentId);
});

test("previewAccepted and summarizeSession surface accepted overlays for review", () => {
  const episode = setup.summarize(draftWithSocial());
  let board = buildBoard(episode);
  const review = buildCorrection(episode, board);
  let session = broll.generate(broll.createSession(episode), episode, review, board);
  session = broll.acceptSuggestion(session, session.suggestions[0].id);
  const applied = broll.applyToBoard(board, session);
  board = applied.board;
  session = applied.session;

  const preview = broll.previewAccepted(session, board);
  const summary = broll.summarizeSession(session, board);

  assert.strictEqual(preview.length, 1);
  assert.ok(preview[0].reason);
  assert.ok(summary.reviewLine.includes("accepted"));
  assert.ok(summary.exportLines.some((line) => /Smart b-roll/.test(line)));
});

test("ACCEPTANCE: suggest, accept, skip, preview, and export accepted b-roll moments", () => {
  const episode = setup.summarize(draftWithSocial());
  let board = buildBoard(episode);
  const review = buildCorrection(episode, board);
  let session = broll.generate(broll.createSession(episode), episode, review, board);

  assert.ok(session.suggestions.length >= 2, "expected multiple suggestions");
  const acceptedId = session.suggestions[0].id;
  const skippedId = session.suggestions[1].id;
  session = broll.acceptSuggestion(session, acceptedId);
  session = broll.skipSuggestion(session, skippedId);

  const applied = broll.applyToBoard(board, session);
  board = applied.board;
  session = applied.session;

  const preview = broll.previewAccepted(session, board);
  const summary = broll.summarizeSession(session, board);
  const exportSummary = exportApi.buildFinalSummary(episode, {
    audioPolish: audio.summarizePolish(audio.createPolish(episode)),
    appliedStyle: style.summarizeStyle(style.createSelection(), episode.speakerCount),
    momentsSummary: moments.summarizeBoard(board),
    brollSummary: summary,
  }, exportApi.createExport(episode));

  assert.strictEqual(summary.acceptedCount, 1);
  assert.strictEqual(summary.skippedCount, 1);
  assert.strictEqual(preview.length, 1);
  assert.ok(moments.listMoments(board).some((moment) => moment.type === "broll"));
  assert.ok(exportSummary.lines.some((line) => /Smart b-roll/.test(line)));
});

console.log(`\nbroll-suggestions: ${passed} passed`);

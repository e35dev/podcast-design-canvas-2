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
const broll = require("../app/broll-suggestions.js");
const exportApi = require("../app/episode-export.js");
const publishReview = require("../app/publish-review.js");

let passed = 0;
function test(name, fn) {
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
    text: "Welcome back, this is Sam Rivera",
    speakerRole: "Host",
    speakerName: "Sam Rivera",
  });
  return board;
}

test("createSuggestionsReview generates contextual suggestions from transcript and social context", () => {
  const episode = setup.summarize(draftWithSocial());
  const contextReview = context.approveReview(context.createReview(episode));
  const board = buildBoard(episode);
  const review = broll.createSuggestionsReview(episode, {
    contextReview: contextReview,
    momentsBoard: board,
  });

  assert.ok(review.suggestions.length >= 2);
  assert.ok(review.suggestions.every((item) => item.rationale && item.text));
  assert.ok(review.suggestions.some((item) => /logo|studio|Topic card|cutaway/i.test(item.text)));
});

test("acceptSuggestion and dismissSuggestion let creators take or skip individual ideas", () => {
  const episode = setup.summarize(draftWithSocial());
  let review = broll.createSuggestionsReview(episode, { momentsBoard: buildBoard(episode) });
  const first = review.suggestions[0];
  const second = review.suggestions[1];
  review = broll.acceptSuggestion(review, first.id);
  review = broll.dismissSuggestion(review, second.id);

  assert.strictEqual(review.suggestions.find((item) => item.id === first.id).status, "accepted");
  assert.strictEqual(review.suggestions.find((item) => item.id === second.id).status, "dismissed");
});

test("updateSuggestion lets creators edit suggested b-roll text before accepting", () => {
  const episode = setup.summarize(draftWithSocial());
  let review = broll.createSuggestionsReview(episode, { momentsBoard: buildBoard(episode) });
  const target = review.suggestions[0];
  review = broll.updateSuggestion(review, target.id, {
    text: "Rivera Media office tour footage",
  });
  assert.strictEqual(
    review.suggestions.find((item) => item.id === target.id).text,
    "Rivera Media office tour footage",
  );
});

test("applyToMoments adds accepted b-roll overlays to the visual moments board", () => {
  const episode = setup.summarize(draftWithSocial());
  let board = buildBoard(episode);
  let review = broll.createSuggestionsReview(episode, { momentsBoard: board });
  review = broll.acceptSuggestion(review, review.suggestions[0].id);
  review = broll.approveSuggestions(review);

  const applied = broll.applyToMoments(board, review);
  board = applied.board;
  review = applied.review;

  const brollMoments = board.moments.filter((moment) => moment.type === "broll");
  assert.ok(brollMoments.length >= 1);
  assert.ok(review.suggestions[0].appliedMomentId);
  const summary = moments.summarizeBoard(board);
  assert.ok((summary.counts.broll || 0) >= 1);
});

test("previewAcceptedSuggestions describes accepted b-roll for episode review", () => {
  const episode = setup.summarize(draftWithSocial());
  let board = buildBoard(episode);
  let review = broll.createSuggestionsReview(episode, { momentsBoard: board });
  review = broll.acceptSuggestion(review, review.suggestions[0].id);
  review = broll.approveSuggestions(review);
  const applied = broll.applyToMoments(board, review);
  board = applied.board;
  review = applied.review;

  const previews = broll.previewAcceptedSuggestions(board, review);
  assert.ok(previews.length >= 1);
  assert.ok(/B-roll overlay|at \d+:\d+/.test(previews[0].previewLine));
  assert.ok(previews[0].rationale);
});

test("summarizeSuggestions feeds export metadata after suggestions are applied", () => {
  const episode = setup.summarize(draftWithSocial());
  let board = buildBoard(episode);
  let review = broll.createSuggestionsReview(episode, { momentsBoard: board });
  review = broll.acceptSuggestion(review, review.suggestions[0].id);
  review = broll.approveSuggestions(review);
  const applied = broll.applySuggestionsReview(review, { momentsBoard: board });
  board = applied.momentsBoard;
  review = applied.suggestionsReview;
  const summary = broll.summarizeSuggestions(review);

  const exportSummary = exportApi.buildFinalSummary(episode, {
    audioPolish: audio.summarizePolish(audio.createPolish(episode)),
    appliedStyle: style.summarizeStyle(style.createSelection(), episode.speakerCount),
    momentsSummary: moments.summarizeBoard(board),
    brollSuggestionsSummary: summary,
  }, exportApi.createExport(episode));

  assert.ok(summary.reviewLine.includes("B-roll suggestions"));
  assert.ok(exportSummary.lines.some((line) => /B-roll suggestions/.test(line)));
  assert.ok(exportSummary.lines.some((line) => /B-roll overlay/.test(line)));
});

test("ACCEPTANCE: generate, accept, skip, preview, and export smart b-roll suggestions", () => {
  const draft = draftWithSocial();
  const episode = setup.summarize(draft);
  const contextReview = context.approveReview(context.updateSpeaker(context.createReview(episode), 0, {
    displayName: "Sam R. Rivera",
    brand: "Rivera Media",
    topics: ["founders", "SaaS"],
  }));
  let board = buildBoard(episode);
  let correctionReview = correction.createCorrectionReview(episode, {
    contextReview: contextReview,
    momentsBoard: board,
  });
  correctionReview = correction.approveCorrection(correctionReview);

  let review = broll.createSuggestionsReview(episode, {
    contextReview: contextReview,
    correctionReview: correctionReview,
    momentsBoard: board,
  });

  assert.ok(review.suggestions.length >= 2);
  const acceptId = review.suggestions[0].id;
  const skipId = review.suggestions[1].id;
  review = broll.acceptSuggestion(review, acceptId);
  review = broll.dismissSuggestion(review, skipId);
  review = broll.approveSuggestions(review);

  const applied = broll.applySuggestionsReview(review, { momentsBoard: board });
  board = applied.momentsBoard;
  review = applied.suggestionsReview;

  const previews = broll.previewAcceptedSuggestions(board, review);
  assert.strictEqual(previews.length, 1);

  const boardSummary = moments.summarizeBoard(board);
  const brollSummary = broll.summarizeSuggestions(review);
  const reviewCtx = {
    audioPolish: audio.summarizePolish(audio.createPolish(episode)),
    appliedStyle: style.summarizeStyle(style.createSelection(), episode.speakerCount),
    momentsSummary: boardSummary,
    momentsBoard: board,
    brollSuggestionsSummary: brollSummary,
    contextApproved: true,
    captionCount: publishReview.countVisibleCaptions(board),
  };
  const episodeReview = publishReview.createReview(episode, reviewCtx);
  assert.ok(episodeReview.checks.some((item) => item.id === "moments-ready" && item.tone === "ok"));
  assert.ok(board.moments.some((moment) => moment.type === "broll" && moment.visible !== false));
});

console.log(`\nbroll suggestions: ${passed} assertions passed`);

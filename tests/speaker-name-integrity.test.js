"use strict";

// Speaker name integrity smoke suite for Podcast Design Canvas (#172).
// Run with: `node tests/speaker-name-integrity.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const audio = require("../app/audio-polish.js");
const moments = require("../app/visual-moments.js");
const context = require("../app/social-context.js");
const correction = require("../app/transcript-correction.js");
const publishPackage = require("../app/publish-package.js");
const exportApi = require("../app/episode-export.js");
const templates = require("../app/show-templates.js");

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

test("shouldSkipHintReplacement blocks prefix hints that would corrupt a correct name", () => {
  assert.strictEqual(
    context.shouldSkipHintReplacement("Sam River", "Sam Rivera", "Sam Rivera welcomes you"),
    true,
  );
  assert.strictEqual(
    context.shouldSkipHintReplacement("Sam River", "Sam Rivera", "Sam River on the show"),
    false,
  );
});

test("applyHintsToText keeps confirmed setup names intact in surrounding copy", () => {
  const episode = setup.summarize(draftWithSocial());
  const review = context.approveReview(context.createReview(episode));

  assert.strictEqual(
    context.applyHintsToText("Sam Rivera welcomes Dana Kim to the show", review, "Host", "Sam Rivera"),
    "Sam Rivera welcomes Dana Kim to the show",
  );
  assert.strictEqual(
    context.applyHintsToText("Sam Rivera", review, "Host", "Sam Rivera"),
    "Sam Rivera",
  );
});

test("applyReviewToCanvas preserves setup speaker frame names when context is approved", () => {
  const episode = setup.summarize(draftWithSocial());
  const review = context.approveReview(context.createReview(episode));
  const canvas = context.applyReviewToCanvas(
    {
      captionText: "Sam Rivera opens the episode",
      titleText: "Founders Unfiltered #7",
      speakerFrames: [
        { role: "Host", name: "Sam Rivera" },
        { role: "Guest 1", name: "Dana Kim" },
      ],
    },
    review,
  );

  assert.strictEqual(canvas.speakerFrames[0].name, "Sam Rivera");
  assert.strictEqual(canvas.speakerFrames[1].name, "Dana Kim");
  assert.ok(canvas.captionText.includes("Sam Rivera"));
  assert.ok(!canvas.captionText.includes("Sam Riveraa"));
});

test("ACCEPTANCE: social context fixes transcript misspellings without rewriting setup names", () => {
  const draft = draftWithSocial();
  const episode = setup.summarize(draft);
  let contextReview = context.createReview(episode);
  contextReview = context.updateSpeaker(contextReview, 0, {
    spellingHints: "Sam Rivira, Sam River",
  });
  contextReview = context.approveReview(contextReview);

  let board = moments.createBoard(episode);
  board = moments.addMoment(board, "caption", {
    time: "0:30",
    text: "Sam Rivira on building in public",
    speakerRole: "Host",
    speakerName: "Sam Rivera",
  });
  board = moments.addMoment(board, "caption", {
    time: "1:00",
    text: "Sam Rivera shares the latest update",
    speakerRole: "Host",
    speakerName: "Sam Rivera",
  });
  board = context.applyReviewToMoments(board, contextReview);

  const misspelled = board.moments.find((moment) => moment.time === "0:30");
  const correct = board.moments.find((moment) => moment.time === "1:00");
  assert.ok(misspelled.text.includes("Sam Rivera"));
  assert.ok(!misspelled.text.includes("Sam Rivira"));
  assert.strictEqual(correct.text, "Sam Rivera shares the latest update");
  assert.ok(!correct.text.includes("Sam Riveraa"));

  const corrReview = correction.approveCorrection(correction.createCorrectionReview(episode, {
    contextReview,
    momentsBoard: board,
  }));

  const applied = correction.applyCorrectionReview(corrReview, {
    momentsBoard: board,
    canvasDoc: {
      captionText: "Sam Rivera welcomes you",
      titleText: episode.episodeName,
      speakerFrames: [{ role: "Host", name: "Sam Rivera" }],
    },
    publishPackage: publishPackage.createPackage(episode, {
      appliedStyle: style.summarizeStyle(style.createSelection(), episode.speakerCount),
    }),
    speakers: draft.speakers,
  });

  assert.strictEqual(applied.speakers[0].name, "Sam Rivera");
  assert.strictEqual(applied.speakers[1].name, "Dana Kim");
  assert.strictEqual(applied.canvasDoc.speakerFrames[0].name, "Sam Rivera");
  assert.ok(!applied.canvasDoc.captionText.includes("Sam Riveraa"));

  const exportSummary = exportApi.buildFinalSummary(
    episode,
    {
      audioPolish: audio.summarizePolish(audio.createPolish(episode)),
      appliedStyle: style.summarizeStyle(style.createSelection(), episode.speakerCount),
      contextSummary: context.summarizeReview(contextReview),
      correctionSummary: correction.summarizeCorrection(corrReview),
      momentsSummary: moments.summarizeBoard(applied.momentsBoard),
    },
    exportApi.createExport(episode),
  );
  assert.ok(exportSummary.lines.some((line) => line.includes("Sam Rivera") || line.includes("Context:")));

  const templateStore = templates.createStore();
  const savedStore = templates.saveTemplate(
    templateStore,
    templates.createTemplate("Founders template", applied.canvasDoc, "tpl-founders"),
  );
  const saved = templates.getTemplate(savedStore, "tpl-founders");
  const episodeWithCorrections = correction.applyToDraftSpeakers(draft.speakers, corrReview);
  const appliedDoc = templates.applyTemplateForEpisode(saved, setup.summarize({
    ...draft,
    speakers: episodeWithCorrections,
  }), style.createSelection());

  assert.strictEqual(appliedDoc.speakerFrames[0].name, "Sam Rivera");
  assert.strictEqual(appliedDoc.speakerFrames[1].name, "Dana Kim");
});

console.log(`\nspeaker name integrity: ${passed} assertions passed`);

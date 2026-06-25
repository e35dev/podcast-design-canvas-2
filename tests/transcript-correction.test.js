"use strict";

// Transcript & caption correction smoke suite for Podcast Design Canvas (#63 — audio-captions).
// Guards the documented acceptance: a review populated from the episode and social context,
// editable speaker labels and key line text, and corrections that propagate to captions,
// visual moments, export metadata, and publish package copy.
// Run with: `node tests/transcript-correction.test.js`.

const assert = require("assert");
const TC = require("../app/transcript-correction.js");
const EXP = require("../app/episode-export.js");
const PP = require("../app/publish-package.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const EPISODE = {
  episodeName: "Building in Public",
  speakerCount: 2,
  sourceModeLabel: "Uploaded speaker files",
  speakers: [
    { role: "Host", name: "Sam Rivera" },
    { role: "Guest 1", name: "Dana Kim" },
  ],
};

// A stand-in for visual-moments listMoments() output.
const MOMENTS = [
  { id: "moment-1", type: "title", speakerRole: "", speakerName: "All speakers", text: "Intro with Sam Rivara" },
  { id: "moment-2", type: "caption", speakerRole: "Host", speakerName: "Sam Rivera", text: "Welcome to the show" },
  { id: "moment-3", type: "broll", speakerRole: "", speakerName: "All speakers", text: "Dashboard b-roll" },
];

// A stand-in social review with a spelling hint to seed term corrections from.
const SOCIAL_REVIEW = {
  speakers: [
    { role: "Host", displayName: "Sam Rivera", spellingHints: ["Sam Rivara"] },
  ],
};

test("createReview is populated from the episode speakers", () => {
  const review = TC.createReview(EPISODE, {});
  assert.deepStrictEqual(review.speakerLabels.map((l) => l.role), ["Host", "Guest 1"]);
  assert.deepStrictEqual(review.speakerLabels.map((l) => l.name), ["Sam Rivera", "Dana Kim"]);
});

test("createReview seeds term corrections from the social context review", () => {
  const review = TC.createReview(EPISODE, { socialReview: SOCIAL_REVIEW });
  assert.ok(review.terms.some((t) => t.from === "Sam Rivara" && t.to === "Sam Rivera"));
});

test("createReview seeds editable lines from caption and title moments only", () => {
  const review = TC.createReview(EPISODE, { moments: MOMENTS });
  assert.deepStrictEqual(review.lines.map((l) => l.id), ["moment-1", "moment-2"]);
  assert.ok(!review.lines.some((l) => l.kind === "broll"), "b-roll is not a correctable line");
});

test("editing a speaker label corrects free text everywhere it appears", () => {
  let review = TC.createReview(EPISODE, {});
  review = TC.updateSpeakerLabel(review, "Guest 1", "Dana Kim-Lee");
  assert.strictEqual(TC.correctText("Today Dana Kim joins us", review), "Today Dana Kim-Lee joins us");
});

test("term corrections fix brand and spelling wording", () => {
  let review = TC.createReview(EPISODE, { socialReview: SOCIAL_REVIEW });
  assert.strictEqual(TC.correctText("A chat with Sam Rivara", review), "A chat with Sam Rivera");
  review = TC.addTerm(review, "Github", "GitHub");
  assert.strictEqual(TC.correctText("We use Github daily", review), "We use GitHub daily");
});

test("editing a key line replaces that moment's caption text on apply", () => {
  let review = TC.createReview(EPISODE, { moments: MOMENTS });
  review = TC.updateLine(review, "moment-2", "Welcome back to the show");
  const corrected = TC.applyToMoments(MOMENTS, review);
  const caption = corrected.find((m) => m.id === "moment-2");
  assert.strictEqual(caption.text, "Welcome back to the show");
});

test("applyToMoments corrects spellings and speaker names across the board", () => {
  let review = TC.createReview(EPISODE, { socialReview: SOCIAL_REVIEW, moments: MOMENTS });
  review = TC.updateSpeakerLabel(review, "Host", "Samuel Rivera");
  const corrected = TC.applyToMoments(MOMENTS, review);
  // Title text had the misspelling "Sam Rivara" — term-corrected to "Sam Rivera" then the
  // label rename "Sam Rivera" -> "Samuel Rivera" applies.
  assert.strictEqual(corrected.find((m) => m.id === "moment-1").text, "Intro with Samuel Rivera");
  // The caption's speaker name is updated to the corrected label.
  assert.strictEqual(corrected.find((m) => m.id === "moment-2").speakerName, "Samuel Rivera");
});

test("applyToPublishPackage corrects title, description, and credit names", () => {
  let review = TC.createReview(EPISODE, { socialReview: SOCIAL_REVIEW });
  review = TC.updateSpeakerLabel(review, "Host", "Samuel Rivera");
  const pkg = {
    title: "Sam Rivara on building",
    description: "A talk with Sam Rivera and Dana Kim.",
    speakerCredits: [{ id: "credit-1", role: "Host", name: "Sam Rivera", creditLine: "Sam Rivera · Host" }],
  };
  const corrected = TC.applyToPublishPackage(pkg, review);
  assert.strictEqual(corrected.title, "Samuel Rivera on building");
  assert.ok(/Samuel Rivera/.test(corrected.description));
  assert.strictEqual(corrected.speakerCredits[0].name, "Samuel Rivera");
  assert.strictEqual(corrected.speakerCredits[0].creditLine, "Samuel Rivera · Host");
});

test("summarizeReview only contributes an export line once approved", () => {
  let review = TC.createReview(EPISODE, { socialReview: SOCIAL_REVIEW, moments: MOMENTS });
  review = TC.updateSpeakerLabel(review, "Host", "Samuel Rivera");
  assert.strictEqual(TC.summarizeReview(review).reviewLine, "", "no line before approval");
  review = TC.approveReview(review);
  const summary = TC.summarizeReview(review);
  assert.ok(/Transcript reviewed/.test(summary.reviewLine));
  assert.strictEqual(summary.renamedCount, 1);
});

test("serialize / deserialize round-trips the review", () => {
  let review = TC.createReview(EPISODE, { socialReview: SOCIAL_REVIEW, moments: MOMENTS });
  review = TC.updateLine(review, "moment-2", "Edited line");
  const restored = TC.deserializeReview(TC.serializeReview(review));
  assert.strictEqual(restored.lines.find((l) => l.id === "moment-2").text, "Edited line");
  assert.strictEqual(restored.speakerLabels.length, 2);
});

// THE cross-module acceptance: a single correction must reach captions/moments, the publish
// package copy, AND the final export metadata — the heart of issue #63.
test("ACCEPTANCE: one correction propagates to captions, publish package, and export metadata", () => {
  let review = TC.createReview(EPISODE, { socialReview: SOCIAL_REVIEW, moments: MOMENTS });
  review = TC.updateSpeakerLabel(review, "Host", "Samuel Rivera");
  review = TC.updateLine(review, "moment-2", "Welcome back, this is Sam Rivera");
  review = TC.approveReview(review);

  // 1. Captions / visual moments.
  const correctedMoments = TC.applyToMoments(MOMENTS, review);
  assert.strictEqual(correctedMoments.find((m) => m.id === "moment-2").text, "Welcome back, this is Samuel Rivera");
  assert.strictEqual(correctedMoments.find((m) => m.id === "moment-1").text, "Intro with Samuel Rivera");

  // 2. Publish package copy.
  let pkg = PP.createPackage(EPISODE, { showName: "Founders Unfiltered", appliedStyle: { background: "#000", accent: "#f0f", textColor: "#fff" } });
  pkg = TC.applyToPublishPackage(pkg, review);
  assert.ok(/Samuel Rivera/.test(pkg.description), "publish description uses the corrected name");
  assert.strictEqual(pkg.speakerCredits[0].name, "Samuel Rivera");

  // 3. Export metadata — the transcript review line appears in the final export summary.
  const ctx = {
    appliedStyle: { presetName: "Bold Broadcast" },
    audioPolish: { presetName: "Clean" },
    transcriptSummary: TC.summarizeReview(review),
    publishPackageSummary: PP.summarizePackage(pkg),
  };
  const finalSummary = EXP.buildFinalSummary(EPISODE, ctx, EXP.createExport(EPISODE));
  assert.ok(
    finalSummary.lines.some((line) => /Transcript reviewed/.test(line)),
    "the export metadata reflects the approved transcript review",
  );
});

console.log(`\ntranscript correction: ${passed} assertions passed`);

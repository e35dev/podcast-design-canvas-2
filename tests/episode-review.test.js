"use strict";

// Full-episode review and approval smoke suite for Podcast Design Canvas (#37).
// Guards the end-to-end review roll-up, the warnings for missing items, and the
// approval gate in both its BLOCKED and APPROVED states.
// Run with: `node tests/episode-review.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const audio = require("../app/audio-polish.js");
const moments = require("../app/visual-moments.js");
const social = require("../app/social-context.js");
const review = require("../app/episode-review.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function completeUploadDraft() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal", fileName: "marco.mp4" }),
  ];
  return draft;
}

// A fully-prepared episode: audio polished, style applied, captions + moments placed,
// context approved, and a show template named.
function readyContext(episode) {
  const selection = style.createSelection();
  const appliedStyle = style.summarizeStyle(selection, episode.speakerCount);
  const polish = audio.summarizePolish(audio.createPolish(episode));
  let board = moments.createBoard(episode);
  board = moments.addMoment(board, "caption", { time: "1:00", text: "Welcome back", speakerRole: "Host" });
  board = moments.addMoment(board, "title", { time: "0:10", text: "Cold open" });
  const momentsSummary = moments.summarizeBoard(board);
  const contextReview = social.approveReview(social.createReview(episode));
  const contextSummary = social.summarizeReview(contextReview);
  return {
    audioPolish: polish,
    appliedStyle,
    templateName: "Founders Unfiltered",
    momentsSummary,
    contextSummary,
  };
}

test("buildReview surfaces every end-to-end area the creator must confirm", () => {
  const episode = setup.summarize(completeUploadDraft());
  const result = review.buildReview(episode, readyContext(episode));
  const ids = result.items.map((item) => item.id).sort();
  assert.deepStrictEqual(ids, [
    "audio",
    "captions",
    "context",
    "export",
    "moments",
    "speakers",
    "style",
    "template",
  ]);
});

test("BLOCKED: a bare episode cannot be approved and lists required gaps", () => {
  const episode = setup.summarize(completeUploadDraft());
  const result = review.buildReview(episode, {}); // no audio, no style

  assert.strictEqual(result.canApprove, false);
  assert.strictEqual(result.approved, false);

  const blockedIds = result.requiredOutstanding.map((item) => item.id).sort();
  assert.deepStrictEqual(blockedIds, ["audio", "export", "style"]);

  // Speakers are fully assigned in this draft, so that required check is already ready.
  const speakers = result.items.find((item) => item.id === "speakers");
  assert.strictEqual(speakers.status, review.STATUS.READY);

  // Every blocked item carries a creator-facing message and a resolve action.
  result.requiredOutstanding.forEach((item) => {
    assert.ok(item.message && item.message.length > 0, `${item.id} needs a message`);
    assert.ok(item.action && item.action.step, `${item.id} needs a resolve action`);
  });
});

test("approveReview refuses while required checks are unmet", () => {
  const episode = setup.summarize(completeUploadDraft());
  const blocked = review.buildReview(episode, {});
  const attempt = review.approveReview(blocked);

  assert.strictEqual(attempt.approved, false);
  assert.strictEqual(attempt.approvedAt, null);
  assert.ok(attempt.error && attempt.error.length > 0);
});

test("missing captions and moments are warnings, not blockers", () => {
  const episode = setup.summarize(completeUploadDraft());
  // Audio + style ready, but no moments/captions/context/template.
  const selection = style.createSelection();
  const ctx = {
    audioPolish: audio.summarizePolish(audio.createPolish(episode)),
    appliedStyle: style.summarizeStyle(selection, episode.speakerCount),
  };
  const result = review.buildReview(episode, ctx);

  // Required checks pass even though recommended items are outstanding.
  assert.strictEqual(result.canApprove, true);

  const captions = result.items.find((item) => item.id === "captions");
  assert.strictEqual(captions.status, review.STATUS.ATTENTION);
  const warnIds = result.recommendedOutstanding.map((item) => item.id).sort();
  assert.deepStrictEqual(warnIds, ["captions", "context", "moments", "template"]);
});

test("empty speaker fields block approval with a specific message", () => {
  const draft = completeUploadDraft();
  draft.speakers[1].name = ""; // Guest 1 left unnamed
  const episode = setup.summarize(draft);
  const ctx = readyContext(episode);
  const result = review.buildReview(episode, ctx);

  const speakers = result.items.find((item) => item.id === "speakers");
  assert.strictEqual(speakers.status, review.STATUS.BLOCKED);
  assert.ok(speakers.message.toLowerCase().includes("name"));
  assert.strictEqual(result.canApprove, false);
});

test("APPROVED: a fully prepared episode approves and records approval", () => {
  const episode = setup.summarize(completeUploadDraft());
  const result = review.buildReview(episode, readyContext(episode));

  assert.strictEqual(result.canApprove, true);
  assert.strictEqual(result.requiredOutstanding.length, 0);

  const approved = review.approveReview(result);
  assert.strictEqual(approved.approved, true);
  assert.ok(typeof approved.approvedAt === "number");
  assert.strictEqual(approved.error, "");

  const summary = review.summarizeReview(approved);
  assert.strictEqual(summary.approved, true);
  assert.strictEqual(summary.blockedCount, 0);
  assert.ok(summary.reviewLine.indexOf("approved") >= 0);
});

test("revokeApproval re-locks the gate after a later change", () => {
  const episode = setup.summarize(completeUploadDraft());
  const approved = review.approveReview(review.buildReview(episode, readyContext(episode)));
  assert.strictEqual(approved.approved, true);

  const revoked = review.revokeApproval(approved);
  assert.strictEqual(revoked.approved, false);
  assert.strictEqual(revoked.approvedAt, null);
});

test("summarizeReview counts ready, warning, and blocked checks", () => {
  const episode = setup.summarize(completeUploadDraft());
  const blocked = review.summarizeReview(review.buildReview(episode, {}));
  assert.ok(blocked.blockedCount >= 3);
  assert.strictEqual(blocked.approved, false);
  assert.ok(blocked.headline.length > 0);

  const ready = review.summarizeReview(review.buildReview(episode, readyContext(episode)));
  assert.strictEqual(ready.blockedCount, 0);
  assert.strictEqual(ready.warningCount, 0);
  assert.strictEqual(ready.total, ready.readyCount);
});

test("ACCEPTANCE: review moves an episode from blocked to approved as gaps are resolved", () => {
  const draft = completeUploadDraft();
  assert.strictEqual(setup.validateDraft(draft).ok, true);
  const episode = setup.summarize(draft);

  // 1) Start: nothing polished or styled yet — review blocks approval.
  let result = review.buildReview(episode, {});
  assert.strictEqual(result.canApprove, false);
  assert.strictEqual(review.approveReview(result).approved, false);

  // 2) Creator resolves audio first — still blocked on style + export readiness.
  const partialCtx = { audioPolish: audio.summarizePolish(audio.createPolish(episode)) };
  result = review.buildReview(episode, partialCtx);
  assert.strictEqual(result.canApprove, false);
  assert.ok(result.requiredOutstanding.some((item) => item.id === "style"));

  // 3) Creator resolves style and adds captions — required checks now pass.
  const fullCtx = readyContext(episode);
  result = review.buildReview(episode, fullCtx);
  assert.strictEqual(result.canApprove, true);

  // 4) Approval succeeds and is recorded.
  const approved = review.approveReview(result);
  assert.strictEqual(approved.approved, true);
  assert.ok(approved.approvedAt);
});

console.log(`\nepisode review: ${passed} assertions passed`);

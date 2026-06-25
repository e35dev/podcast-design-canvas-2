"use strict";

// Smart b-roll suggestions smoke suite for Podcast Design Canvas (#67 — contextual visuals).
// Guards the documented acceptance: suggestions generated from transcript + social context
// with plain-language reasons, accept/skip per suggestion, preview, and accepted b-roll
// flowing into the visual moments board and the export output.
// Run with: `node tests/broll-suggestions.test.js`.

const assert = require("assert");
const BR = require("../app/broll-suggestions.js");
const VM = require("../app/visual-moments.js");
const EXP = require("../app/episode-export.js");

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

const OPTIONS = {
  speakerSignals: [
    { role: "Host", name: "Sam Rivera", brand: "Riverside", topics: ["podcasting"] },
    { role: "Guest 1", name: "Dana Kim", brand: "Acme", topics: ["growth"] },
  ],
  lines: [
    { time: "1:30", speakerRole: "Host", speakerName: "Sam Rivera", text: "We built this on Riverside from day one" },
    { time: "4:10", speakerRole: "Guest 1", speakerName: "Dana Kim", text: "Our growth loop changed everything" },
  ],
};

test("generates suggestions from brands, topics, and transcript lines", () => {
  const board = BR.generateSuggestions(EPISODE, OPTIONS);
  assert.ok(board.suggestions.length >= 4, "expected several suggestions");
  assert.ok(board.suggestions.some((s) => s.kind === "logo" && /Riverside/.test(s.label)));
  assert.ok(board.suggestions.some((s) => s.kind === "topic-card" && /podcasting/.test(s.label)));
  // A line mentioning a brand becomes a time-anchored cutaway.
  assert.ok(board.suggestions.some((s) => s.time === "1:30" && /Riverside/.test(s.sourceTerm)));
});

test("every suggestion has a plain-language reason and a kind label", () => {
  const board = BR.generateSuggestions(EPISODE, OPTIONS);
  board.suggestions.forEach((s) => {
    assert.ok(s.reason && s.reason.length > 10, `${s.id} has a reason`);
    assert.ok(BR.getKind(s.kind).label, `${s.id} maps to a kind label`);
    assert.strictEqual(s.status, "suggested");
  });
});

test("suggestions can be accepted and skipped individually", () => {
  let board = BR.generateSuggestions(EPISODE, OPTIONS);
  const first = board.suggestions[0].id;
  const second = board.suggestions[1].id;
  board = BR.acceptSuggestion(board, first);
  board = BR.skipSuggestion(board, second);
  assert.strictEqual(BR.findSuggestion(board, first).status, "accepted");
  assert.strictEqual(BR.findSuggestion(board, second).status, "skipped");
  assert.strictEqual(BR.listByStatus(board, "accepted").length, 1);
  assert.strictEqual(BR.listByStatus(board, "skipped").length, 1);
});

test("previewSuggestion explains how the b-roll lands on screen", () => {
  let board = BR.generateSuggestions(EPISODE, OPTIONS);
  const id = board.suggestions[0].id;
  const preview = BR.previewSuggestion(board, id);
  assert.ok(/b-roll overlay/i.test(preview.treatment));
  assert.ok(preview.kindLabel && preview.reason);
});

test("an accepted suggestion converts to a visual-moments b-roll payload", () => {
  let board = BR.generateSuggestions(EPISODE, OPTIONS);
  board = BR.acceptSuggestion(board, board.suggestions[0].id);
  const moments = BR.acceptedMoments(board);
  assert.strictEqual(moments.length, 1);
  assert.strictEqual(moments[0].type, "broll");
  assert.ok(moments[0].text);
});

test("summarizeBoard reports accepted/skipped counts and export lines", () => {
  let board = BR.generateSuggestions(EPISODE, OPTIONS);
  board = BR.acceptSuggestion(board, board.suggestions[0].id);
  board = BR.skipSuggestion(board, board.suggestions[1].id);
  const summary = BR.summarizeBoard(board);
  assert.strictEqual(summary.accepted, 1);
  assert.strictEqual(summary.skipped, 1);
  assert.ok(/B-roll/.test(summary.reviewLine));
  assert.ok(summary.exportLines.length >= 1);
});

test("serialize / deserialize round-trips the board and statuses", () => {
  let board = BR.generateSuggestions(EPISODE, OPTIONS);
  board = BR.acceptSuggestion(board, board.suggestions[0].id);
  const restored = BR.deserializeBoard(BR.serializeBoard(board));
  assert.strictEqual(restored.suggestions.length, board.suggestions.length);
  assert.strictEqual(restored.suggestions[0].status, "accepted");
});

// THE acceptance: a generated suggestion that is accepted must become a real b-roll moment
// on the visual-moments board AND therefore be reflected in the final export output.
test("ACCEPTANCE: accepted b-roll appears in visual moments and the export summary", () => {
  let board = BR.generateSuggestions(EPISODE, OPTIONS);
  const logo = board.suggestions.find((s) => s.kind === "logo");
  const topic = board.suggestions.find((s) => s.kind === "topic-card");
  board = BR.acceptSuggestion(board, logo.id);
  board = BR.skipSuggestion(board, topic.id);

  // Convert accepted suggestions into real b-roll visual moments.
  let momentsBoard = VM.createBoard({});
  BR.acceptedMoments(board).forEach((payload) => {
    momentsBoard = VM.addMoment(momentsBoard, "broll", payload);
  });

  // 1. The b-roll moment is on the board.
  const counts = VM.countsByType(momentsBoard);
  assert.ok((counts.broll || 0) >= 1, "an accepted b-roll moment is on the board");

  // 2. It flows into the final export summary via the moments review line.
  const ctx = {
    appliedStyle: { presetName: "Bold Broadcast" },
    audioPolish: { presetName: "Clean" },
    momentsSummary: VM.summarizeBoard(momentsBoard),
    brollSummary: BR.summarizeBoard(board),
  };
  const finalSummary = EXP.buildFinalSummary(EPISODE, ctx, EXP.createExport(EPISODE));
  assert.ok(
    finalSummary.lines.some((line) => /b-roll/i.test(line)),
    "the export summary reflects the accepted b-roll",
  );
  // The skipped suggestion did not become a moment.
  assert.strictEqual(BR.acceptedMoments(board).length, 1);
});

console.log(`\nb-roll suggestions: ${passed} assertions passed`);

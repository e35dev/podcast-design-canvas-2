"use strict";

// Smart b-roll suggestion smoke suite for Podcast Design Canvas (#67).
// Guards generating suggestions from transcript/terms/social context, accepting/skipping
// them, previewing accepted b-roll as visual moments, and including it in export output.
// Run with: `node tests/broll-suggestions.test.js`.

const assert = require("assert");
const BR = require("../app/broll-suggestions.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function sampleInput() {
  return {
    transcript: [
      { id: "line-1", speakerRole: "Host", speakerName: "Dana Kim", text: "Welcome — today we dig into robotics.", time: "0:10" },
      { id: "line-2", speakerRole: "Guest 1", speakerName: "Marco Vidal", text: "At Acme Robotics we shipped a new arm.", time: "2:30" },
    ],
    keywords: [
      { term: "Acme Robotics", kind: "logo" },
      { term: "robotics", kind: "topic-card" },
    ],
    speakers: [
      { role: "Host", name: "Dana Kim", social: [{ label: "Twitter", url: "https://twitter.com/danakim" }] },
      { role: "Guest 1", name: "Marco Vidal", social: [] },
    ],
  };
}

test("SUGGESTION_TYPES covers image, screen capture, logo, product, and topic card", () => {
  const ids = BR.SUGGESTION_TYPES.map((t) => t.id);
  ["logo", "product", "screen-capture", "topic-card", "image"].forEach((id) => {
    assert.ok(ids.includes(id), `${id} present`);
  });
});

test("generateSuggestions ties keyword mentions to the transcript moment with a reason", () => {
  const set = BR.generateSuggestions(sampleInput());
  const acme = set.suggestions.find((s) => s.term === "Acme Robotics");
  assert.ok(acme, "Acme Robotics suggestion created");
  assert.strictEqual(acme.type, "logo");
  assert.strictEqual(acme.momentId, "line-2");
  assert.strictEqual(acme.time, "2:30");
  assert.ok(acme.reason.includes("Acme Robotics"));
  assert.ok(/2:30/.test(acme.reason), "reason references the moment time");
});

test("generateSuggestions uses social context to suggest a speaker brand logo", () => {
  const set = BR.generateSuggestions(sampleInput());
  const social = set.suggestions.find((s) => s.type === "logo" && /Dana Kim/.test(s.term));
  assert.ok(social, "a logo suggestion for the speaker with a social link");
  assert.ok(social.reason.toLowerCase().includes("profile") || social.reason.toLowerCase().includes("social"));
});

test("a speaker with no social links gets no social-logo suggestion", () => {
  const set = BR.generateSuggestions(sampleInput());
  const marcoSocial = set.suggestions.filter((s) => s.type === "logo" && s.term === "Marco Vidal" && /profile|social/i.test(s.reason));
  assert.strictEqual(marcoSocial.length, 0);
});

test("all suggestions start in the suggested state", () => {
  const set = BR.generateSuggestions(sampleInput());
  assert.ok(set.suggestions.length >= 2);
  assert.ok(set.suggestions.every((s) => s.status === BR.STATUS.SUGGESTED));
});

test("acceptSuggestion and skipSuggestion move items between states", () => {
  let set = BR.generateSuggestions(sampleInput());
  const ids = set.suggestions.map((s) => s.id);
  set = BR.acceptSuggestion(set, ids[0]);
  set = BR.skipSuggestion(set, ids[1]);
  assert.strictEqual(BR.listByStatus(set, BR.STATUS.ACCEPTED).length, 1);
  assert.strictEqual(BR.listByStatus(set, BR.STATUS.SKIPPED).length, 1);
  assert.strictEqual(BR.listByStatus(set, BR.STATUS.ACCEPTED)[0].id, ids[0]);
});

test("toVisualMoment shapes an accepted suggestion as a b-roll moment", () => {
  const set = BR.generateSuggestions(sampleInput());
  const moment = BR.toVisualMoment(set.suggestions[0]);
  assert.strictEqual(moment.type, "broll");
  assert.ok(moment.text.length > 0);
  assert.strictEqual(moment.source, "broll-suggestion");
  assert.ok(moment.time);
});

test("acceptedMoments returns only accepted suggestions as visual moments (preview/export)", () => {
  let set = BR.generateSuggestions(sampleInput());
  const ids = set.suggestions.map((s) => s.id);
  set = BR.acceptSuggestion(set, ids[0]);
  const moments = BR.acceptedMoments(set);
  assert.strictEqual(moments.length, 1);
  assert.strictEqual(moments[0].type, "broll");
});

test("buildExportBroll lists accepted b-roll for the publish/export output", () => {
  let set = BR.generateSuggestions(sampleInput());
  const ids = set.suggestions.map((s) => s.id);
  set = BR.acceptSuggestion(set, ids[0]);
  const exp = BR.buildExportBroll(set);
  assert.strictEqual(exp.count, 1);
  assert.ok(exp.lines[0].length > 0);
});

test("summarize reports suggested / accepted / skipped counts", () => {
  let set = BR.generateSuggestions(sampleInput());
  const ids = set.suggestions.map((s) => s.id);
  set = BR.acceptSuggestion(set, ids[0]);
  const s = BR.summarize(set);
  assert.strictEqual(s.total, set.suggestions.length);
  assert.strictEqual(s.acceptedCount, 1);
  assert.ok(s.reviewLine.includes("accepted"));
});

test("suggestions persist across serialize/deserialize", () => {
  let set = BR.generateSuggestions(sampleInput());
  set = BR.acceptSuggestion(set, set.suggestions[0].id);
  const restored = BR.deserialize(BR.serialize(set));
  assert.strictEqual(restored.suggestions.length, set.suggestions.length);
  assert.strictEqual(BR.listByStatus(restored, BR.STATUS.ACCEPTED).length, 1);
});

// End-to-end: generate → review reasons → accept/skip → preview → export.
test("ACCEPTANCE: suggest, accept/skip, preview, and export b-roll moments", () => {
  let set = BR.generateSuggestions(sampleInput());
  assert.ok(set.suggestions.length >= 3, "generated suggestions from terms + social");

  // Every suggestion explains why it's relevant.
  assert.ok(set.suggestions.every((s) => s.reason && s.reason.length > 0));

  // Accept the brand-logo for Acme, skip the generic robotics topic card.
  const acme = set.suggestions.find((s) => s.term === "Acme Robotics");
  const topic = set.suggestions.find((s) => s.term === "robotics");
  set = BR.acceptSuggestion(set, acme.id);
  set = BR.skipSuggestion(set, topic.id);

  // Preview: accepted b-roll appears as visual moments.
  const moments = BR.acceptedMoments(set);
  assert.ok(moments.some((m) => /Acme Robotics/.test(m.text)));
  assert.ok(!moments.some((m) => /^robotics/i.test(m.text)), "skipped suggestion not previewed");

  // Export: accepted b-roll is in the publish output, skipped is not.
  const exp = BR.buildExportBroll(set);
  assert.ok(exp.count >= 1);
  assert.ok(exp.lines.some((l) => l.includes("Acme Robotics")));
});

console.log(`\nb-roll suggestions: ${passed} assertions passed`);

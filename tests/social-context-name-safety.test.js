"use strict";
// Social context must not corrupt confirmed speaker names (#172 / #41).
const assert = require("assert");
const SC = require("../app/social-context.js");
const TC = require("../app/transcript-correction.js");
let passed = 0;
function test(n, fn) { fn(); passed += 1; console.log(`  ok ${n}`); }

function approvedReview() {
  const r = SC.createReview({ episodeName: "E", speakers: [
    { role: "Host", name: "Sam Rivera", social: [{ key: "twitter", url: "https://x.com/samrivera" }] },
  ] });
  r.approved = true;
  r.speakers.forEach((s) => (s.approved = true));
  return r;
}

test("applyHintsToText keeps the confirmed name exactly", () => {
  const r = approvedReview();
  for (const t of ["Sam Rivera shares the story", "intro with Sam Rivera", "Sam Rivera: welcome"]) {
    const out = SC.applyHintsToText(t, r, "Host", "Sam Rivera");
    assert.ok(!out.includes("Riveraa"), `corrupted: ${out}`);
    assert.ok(out.includes("Sam Rivera"), `lost name: ${out}`);
  }
});

test("applyHintsToText still corrects a genuine variant spelling", () => {
  const r = approvedReview();
  assert.strictEqual(
    SC.applyHintsToText("SamRivera joins", r, "Host", "Sam Rivera"),
    "Sam Rivera joins",
  );
});

test("canvas title/caption keep the name through review", () => {
  const r = approvedReview();
  const out = SC.applyReviewToCanvas({ titleText: "Sam Rivera", captionText: "Sam Rivera: welcome" }, r);
  assert.strictEqual(out.titleText, "Sam Rivera");
  assert.ok(!out.captionText.includes("Riveraa"));
});

test("transcript correction does not build a name-corrupting replacement", () => {
  const base = { episodeName: "E", speakers: [
    { role: "Host", name: "Sam Rivera", social: [{ key: "twitter", url: "https://x.com/samrivera" }] },
  ] };
  const cr = approvedReview();
  const review = TC.createCorrectionReview(base, cr);
  const speakerReps = (review.replacements || []).filter((x) => x.kind === "speaker");
  speakerReps.forEach((rep) => {
    assert.notStrictEqual(rep.from.toLowerCase(), "sam river", "kept the corrupting substring rule");
  });
  const out = TC.applyReplacements("Today Sam Rivera explains", review.replacements);
  assert.ok(!out.includes("Riveraa"), `transcript corrupted: ${out}`);
});

console.log(`\nsocial-context-name-safety: ${passed} test(s) passed.`);

"use strict";

// Episode import scan layout smoke suite for Podcast Design Canvas (#86).
// Run with: `node tests/episode-import-scan.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const scan = require("../app/episode-import-scan.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function sampleDraft() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), {
      name: "Sam Rivera",
      fileName: "sam.mp4",
      social: { website: "https://samrivera.show" },
    }),
    Object.assign(setup.createSpeaker("Guest 1"), {
      name: "Dana Kim",
      fileName: "dana.mp4",
      social: { linkedin: "https://linkedin.com/in/danakim" },
    }),
  ];
  return draft;
}

test("setup sections order details, source, then speakers", () => {
  assert.deepStrictEqual(
    scan.SETUP_SECTIONS.map((item) => item.id),
    ["details", "source", "speakers"],
  );
  assert.strictEqual(scan.sectionTitle("details"), "1. Episode details");
  assert.strictEqual(scan.sectionTitle("speakers"), "3. Speakers & sources");
});

test("speaker groups label identity, recording, and social fields", () => {
  assert.strictEqual(scan.speakerGroupLabel("identity"), "Name & role");
  assert.strictEqual(scan.speakerGroupLabel("recording"), "Recording source");
  assert.strictEqual(scan.speakerGroupLabel("social"), "Social links");
});

test("buildDraftSummary lists roles, names, sources, and social counts", () => {
  const draft = sampleDraft();
  const episode = setup.summarize(draft);
  const summary = scan.buildDraftSummary(draft, episode);

  assert.strictEqual(summary.episodeName, "Founders Unfiltered #7");
  assert.strictEqual(summary.speakerCount, 2);
  assert.strictEqual(summary.speakerLines[0].role, "Host");
  assert.strictEqual(summary.speakerLines[1].role, "Guest 1");
  assert.strictEqual(summary.speakerLines[0].name, "Sam Rivera");
  assert.ok(/sam\.mp4/.test(summary.speakerLines[0].source));
  assert.strictEqual(summary.socialLinkCount, 2);
  assert.ok(summary.reviewLine.includes("2 speaker sources"));
});

test("ACCEPTANCE: import scan model supports separated sections and editable speaker roles", () => {
  const draft = sampleDraft();
  const episode = setup.summarize(draft);
  assert.strictEqual(setup.validateDraft(draft).ok, true);

  const riversideDraft = setup.createDraft();
  riversideDraft.sourceMode = "riverside";
  riversideDraft.riversideLink = "https://riverside.fm/studio/founders-7";
  riversideDraft.speakers[0].name = "Sam Rivera";
  riversideDraft.speakers[0].role = "Host";
  assert.strictEqual(setup.validateDraft(riversideDraft).ok, true);

  const summary = scan.buildDraftSummary(draft, episode);
  assert.ok(scan.SETUP_SECTIONS.every((section) => section.step >= 1));
  assert.ok(summary.speakerLines.every((line) => /Host|Guest/.test(line.role)));
  assert.ok(summary.speakerLines.every((line) => line.socialCount >= 0));
  assert.strictEqual(scan.countSocialLinks(draft.speakers[0]), 1);
});

console.log(`\nepisode-import-scan: ${passed} passed`);

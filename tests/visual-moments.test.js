"use strict";

// Visual moments smoke suite for Podcast Design Canvas (#19).
// Guards timeline creation, four moment types, editing, persistence, and preview.
// Run with: `node tests/visual-moments.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const moments = require("../app/visual-moments.js");

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

test("supports caption, title moment, b-roll, and visual callout types", () => {
  assert.strictEqual(moments.MOMENT_TYPES.length, 4);
  const ids = moments.MOMENT_TYPES.map((type) => type.id);
  assert.deepStrictEqual(ids, ["caption", "title", "broll", "callout"]);
});

test("createTimeline seeds speaker-aware transcript-style moments", () => {
  moments._resetMomentCounter();
  const episode = setup.summarize(completeUploadDraft());
  const timeline = moments.createTimeline(episode);
  assert.strictEqual(timeline.episodeName, "Founders Unfiltered #7");
  assert.ok(timeline.moments.length >= 3);
  assert.strictEqual(timeline.moments[0].speakerRole, "Host");
  assert.strictEqual(timeline.moments[1].speakerName, "Dana Kim");
});

test("addMoment appends a new moment with timing after the last entry", () => {
  moments._resetMomentCounter();
  const episode = setup.summarize(completeUploadDraft());
  let timeline = moments.createTimeline(episode);
  const count = timeline.moments.length;
  timeline = moments.addMoment(timeline, "callout", { role: "Guest 2", name: "Marco Vidal" });
  assert.strictEqual(timeline.moments.length, count + 1);
  const added = moments.findMoment(timeline, timeline.selectedId);
  assert.strictEqual(added.type, "callout");
  assert.ok(added.startSec >= 0);
});

test("updateMoment edits text, timing, and visibility", () => {
  moments._resetMomentCounter();
  const timeline = moments.createTimeline(setup.summarize(completeUploadDraft()));
  const target = timeline.moments[0];
  let updated = moments.updateMoment(timeline, target.id, {
    text: "Welcome back to the show",
    startSec: 120,
    endSec: 150,
    visible: false,
  });
  const moment = moments.findMoment(updated, target.id);
  assert.strictEqual(moment.text, "Welcome back to the show");
  assert.strictEqual(moment.startSec, 120);
  assert.strictEqual(moment.endSec, 150);
  assert.strictEqual(moment.visible, false);
  updated = moments.toggleMomentVisibility(updated, target.id);
  assert.strictEqual(moments.findMoment(updated, target.id).visible, true);
});

test("serializeTimeline round-trips edits for persistence", () => {
  moments._resetMomentCounter();
  let timeline = moments.createTimeline(setup.summarize(completeUploadDraft()));
  const id = timeline.moments[0].id;
  timeline = moments.updateMoment(timeline, id, { text: "Persisted caption" });
  const json = moments.serializeTimeline(timeline);
  const restored = moments.deserializeTimeline(json);
  assert.strictEqual(restored.moments.length, timeline.moments.length);
  assert.strictEqual(moments.findMoment(restored, id).text, "Persisted caption");
});

test("buildMomentPreview describes how a moment looks on the episode", () => {
  moments._resetMomentCounter();
  const timeline = moments.createTimeline(setup.summarize(completeUploadDraft()));
  const moment = timeline.moments[0];
  const selection = style.createSelection();
  const applied = style.summarizeStyle(selection, 3);
  const preview = moments.buildMomentPreview(moment, applied);
  assert.strictEqual(preview.typeLabel, moments.getMomentType(moment.type).label);
  assert.strictEqual(preview.text, moment.text);
  assert.ok(preview.timeLabel.includes("–"));
  assert.strictEqual(preview.accent, applied.accent);
});

test("ACCEPTANCE: create, edit, persist, and preview visual moments", () => {
  moments._resetMomentCounter();
  const episode = setup.summarize(completeUploadDraft());
  let timeline = moments.createTimeline(episode);

  moments.MOMENT_TYPES.forEach((type) => {
    timeline = moments.addMoment(timeline, type.id, episode.speakers[0]);
  });
  assert.ok(timeline.moments.length >= 7);

  const selected = moments.findMoment(timeline, timeline.selectedId);
  timeline = moments.updateMoment(timeline, selected.id, {
    text: "A polished title card for the cold open",
    startSec: 0,
    endSec: 12,
  });

  const stored = moments.deserializeTimeline(moments.serializeTimeline(timeline));
  assert.strictEqual(moments.findMoment(stored, selected.id).text, "A polished title card for the cold open");

  const preview = moments.buildMomentPreview(moments.findMoment(stored, selected.id), {
    accent: "#ffb347",
    background: "#10131f",
  });
  assert.strictEqual(preview.visible, true);
  assert.ok(preview.previewClass);

  const summary = moments.summarizeTimeline(stored);
  assert.ok(summary.visibleCount >= 1);
  assert.ok(summary.summaryLine.length > 0);
});

console.log(`\nvisual moments: ${passed} assertions passed`);

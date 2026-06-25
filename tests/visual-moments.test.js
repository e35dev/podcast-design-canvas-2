"use strict";

// Visual moments editor smoke suite for Podcast Design Canvas (#19).
// Guards the documented acceptance: a transcript-style, speaker-aware timeline onto which the
// creator can add at least four moment types (captions, title moment, b-roll overlay, visual
// callout), edit their timing/text/visibility, preview how a moment affects the episode look,
// and have those edits persist across navigation.
// Run with: `node tests/visual-moments.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const moments = require("../app/visual-moments.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function episode() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
  ];
  return setup.summarize(draft);
}

test("opens a transcript-style timeline that is speaker-aware", () => {
  const doc = moments.createDoc(episode(), 3600);
  assert.ok(doc.timeline.length >= 6, "a full-episode timeline is built");
  const roles = new Set(doc.timeline.map((s) => s.speakerRole));
  assert.ok(roles.has("Host") && roles.has("Guest 1"), "segments are attributed to the real speakers");
  doc.timeline.forEach((segment) => {
    assert.ok(segment.time > 0 && segment.time <= doc.durationSeconds, "segments sit within the episode");
    assert.ok(/^\d+:\d{2}$/.test(segment.timecode), "creator-facing MM:SS timecode");
    assert.ok(segment.text, "each segment has transcript text");
  });
});

test("offers at least four creator-facing moment types incl. caption/title/b-roll/callout", () => {
  const ids = moments.MOMENT_TYPES.map((t) => t.id);
  ["caption", "title", "broll", "callout"].forEach((id) => assert.ok(ids.includes(id), `${id} is available`));
  assert.ok(moments.MOMENT_TYPES.length >= 4);
});

test("adds moments of each required type, anchored to the speaker at that point", () => {
  const doc = moments.createDoc(episode(), 3600);
  const cap = moments.addMoment(doc, "caption", 300);
  const title = moments.addMoment(doc, "title", 0);
  const broll = moments.addMoment(doc, "broll", 1800);
  const callout = moments.addMoment(doc, "callout", 3300);
  assert.strictEqual(doc.moments.length, 4);
  assert.deepStrictEqual([cap.type, title.type, broll.type, callout.type], ["caption", "title", "broll", "callout"]);
  assert.notStrictEqual(cap.id, title.id, "each placed moment gets a unique id");
  assert.ok(cap.speakerRole, "a moment picks up the nearest speaker");
  assert.ok(cap.visible, "new moments are visible by default");
});

test("clamps a moment's time to within the episode", () => {
  const doc = moments.createDoc(episode(), 3600);
  const m = moments.addMoment(doc, "caption", 99999);
  assert.strictEqual(m.time, 3600, "time past the end is clamped to the duration");
  const early = moments.addMoment(doc, "caption", -50);
  assert.strictEqual(early.time, 0, "negative time is clamped to the start");
});

test("edits a moment's timing, text, and visibility", () => {
  const doc = moments.createDoc(episode(), 3600);
  const m = moments.addMoment(doc, "caption", 300);
  moments.updateMoment(doc, m.id, { text: "Welcome to the show", time: 615 });
  assert.strictEqual(m.text, "Welcome to the show");
  assert.strictEqual(m.time, 615);
  assert.strictEqual(m.timecode, "10:15", "timecode updates with the time");
  moments.updateMoment(doc, m.id, { visible: false });
  assert.strictEqual(m.visible, false);
  moments.toggleMoment(doc, m.id);
  assert.strictEqual(m.visible, true, "toggle flips visibility back");
});

test("listMoments returns moments in playback order", () => {
  const doc = moments.createDoc(episode(), 3600);
  moments.addMoment(doc, "caption", 1800);
  moments.addMoment(doc, "title", 0);
  moments.addMoment(doc, "callout", 600);
  const times = moments.listMoments(doc).map((m) => m.time);
  assert.deepStrictEqual(times, [0, 600, 1800], "sorted by time");
});

test("removeMoment deletes the moment", () => {
  const doc = moments.createDoc(episode(), 3600);
  const m = moments.addMoment(doc, "broll", 900);
  assert.strictEqual(moments.removeMoment(doc, m.id), true);
  assert.strictEqual(doc.moments.length, 0);
  assert.strictEqual(moments.removeMoment(doc, "nope"), false);
});

test("previewMoment describes how the selected moment affects the episode look", () => {
  const doc = moments.createDoc(episode(), 3600);
  const m = moments.addMoment(doc, "title", 300);
  moments.updateMoment(doc, m.id, { text: "Part One: Origins" });
  const preview = moments.previewMoment(doc, m.id);
  assert.strictEqual(preview.typeLabel, "Title moment");
  assert.ok(preview.effect.includes("Part One: Origins"), "preview shows the moment's text");
  assert.ok(preview.headline.includes(preview.timecode), "preview is anchored in time");
  // A hidden moment previews as not appearing.
  moments.updateMoment(doc, m.id, { visible: false });
  assert.ok(/hidden/i.test(moments.previewMoment(doc, m.id).effect));
});

test("summarizeMoments counts visible moments by type", () => {
  const doc = moments.createDoc(episode(), 3600);
  moments.addMoment(doc, "caption", 300);
  moments.addMoment(doc, "caption", 600);
  const hidden = moments.addMoment(doc, "title", 900);
  moments.updateMoment(doc, hidden.id, { visible: false });
  const summary = moments.summarizeMoments(doc);
  assert.strictEqual(summary.byType.caption, 2);
  assert.strictEqual(summary.byType.title, 0, "hidden moments are not counted as visible");
  assert.strictEqual(summary.visibleCount, 2);
  assert.ok(summary.line.includes("2 captions"));
});

test("placed moments persist across navigation (serialize -> deserialize)", () => {
  const summary = episode();
  const doc = moments.createDoc(summary, 3600);
  moments.addMoment(doc, "caption", 300);
  const title = moments.addMoment(doc, "title", 1200);
  moments.updateMoment(doc, title.id, { text: "Halfway point" });
  moments.toggleMoment(doc, title.id); // hide it

  const stored = moments.serialize(doc);
  const restored = moments.deserialize(stored, summary);
  assert.strictEqual(restored.moments.length, 2, "all placed moments come back");
  const restoredTitle = moments.findMoment(restored, title.id);
  assert.strictEqual(restoredTitle.text, "Halfway point", "edited text persists");
  assert.strictEqual(restoredTitle.visible, false, "visibility persists");
  assert.ok(restoredTitle.speakerRole, "restored moment re-anchors to a speaker");

  // A moment added after restore does not collide with restored ids.
  const added = moments.addMoment(restored, "callout", 2400);
  assert.strictEqual(restored.moments.filter((m) => m.id === added.id).length, 1, "new id is unique after restore");
});

// End-to-end: the documented runnable check for issue #19 — open the moments editor, add the
// four required moment types, edit one, preview it, and confirm everything persists.
test("ACCEPTANCE: add four moment types, edit, preview, and persist", () => {
  const summary = episode();
  const doc = moments.createDoc(summary, 3600);

  moments.addMoment(doc, "caption", 120);
  moments.addMoment(doc, "title", 0);
  moments.addMoment(doc, "broll", 1500);
  const callout = moments.addMoment(doc, "callout", 3000);
  assert.strictEqual(moments.summarizeMoments(doc).typesUsed.length, 4, "all four required types are placed");

  moments.updateMoment(doc, callout.id, { text: "This is the key takeaway" });
  const preview = moments.previewMoment(doc, callout.id);
  assert.ok(preview.effect.includes("This is the key takeaway"));

  const restored = moments.deserialize(moments.serialize(doc), summary);
  assert.strictEqual(restored.moments.length, 4, "the produced episode survives navigating away and back");
  assert.strictEqual(moments.findMoment(restored, callout.id).text, "This is the key takeaway");
});

console.log(`\nvisual moments: ${passed} assertions passed`);

"use strict";

// Visual moments editor smoke suite for Podcast Design Canvas (#19 — contextual visuals).
// Guards the documented acceptance: a speaker-aware timeline with at least four moment
// types (captions, title moments, b-roll overlays, visual callouts) that can be created,
// edited (timing / text / visibility), previewed, and persisted.
// Run with: `node tests/episode-moments.test.js`.

const assert = require("assert");
const moments = require("../app/episode-moments.js");
const setup = require("../app/episode-setup.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const SPEAKERS = [
  { role: "Host", name: "Sam Rivera" },
  { role: "Guest 1", name: "Dana Kim" },
  { role: "Guest 2", name: "Marco Vidal" },
];

test("offers at least four distinct creator-facing moment types", () => {
  assert.ok(moments.MOMENT_TYPES.length >= 4, "need 4+ moment types");
  const keys = moments.MOMENT_TYPES.map((t) => t.key);
  ["caption", "title", "broll", "callout"].forEach((key) => {
    assert.ok(keys.includes(key), `expected a ${key} moment type`);
  });
  assert.strictEqual(new Set(keys).size, keys.length, "moment type keys are unique");
  moments.MOMENT_TYPES.forEach((t) => {
    assert.ok(t.label && t.noun && t.defaultText, `${t.key} is fully described`);
  });
});

test("a fresh moments state is empty and long-form by default", () => {
  const state = moments.createMomentsState();
  assert.deepStrictEqual(state.moments, []);
  // Defaults to an hour so the timeline targets long-form episodes, not short clips.
  assert.ok(state.durationSeconds >= 60 * 60);
});

test("formats and parses timecodes both ways", () => {
  assert.strictEqual(moments.formatTimecode(75), "1:15");
  assert.strictEqual(moments.formatTimecode(3661), "1:01:01");
  assert.strictEqual(moments.parseTimecode("1:15"), 75);
  assert.strictEqual(moments.parseTimecode("1:01:01"), 3661);
  assert.strictEqual(moments.parseTimecode("90"), 90);
  assert.strictEqual(moments.parseTimecode("not a time"), null);
});

test("adds each moment type and clamps times into the episode", () => {
  const state = moments.createMomentsState(600);
  const caption = moments.addMoment(state, "caption", 30, { speakerRole: "Host" });
  const title = moments.addMoment(state, "title", 0, { text: "Cold open" });
  const broll = moments.addMoment(state, "broll", 120);
  const callout = moments.addMoment(state, "callout", 9999, { speakerRole: "Guest 1" }); // past end

  assert.strictEqual(state.moments.length, 4);
  assert.strictEqual(caption.type, "caption");
  assert.strictEqual(caption.speakerRole, "Host");
  assert.strictEqual(title.text, "Cold open");
  assert.strictEqual(broll.speakerRole, "", "b-roll is not speaker-aware");
  assert.strictEqual(callout.atSeconds, 600, "time is clamped to the episode duration");
  // Every moment is uniquely addressable.
  const ids = state.moments.map((m) => m.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test("edits a moment's timing, text, and visibility", () => {
  const state = moments.createMomentsState(600);
  const m = moments.addMoment(state, "caption", 30, { speakerRole: "Host" });

  moments.updateMoment(state, m.id, { text: "Welcome back to the show", atSeconds: 45 });
  assert.strictEqual(m.text, "Welcome back to the show");
  assert.strictEqual(m.atSeconds, 45);

  moments.updateMoment(state, m.id, { atSeconds: 99999 });
  assert.strictEqual(m.atSeconds, 600, "edited time is clamped too");

  moments.toggleVisible(state, m.id);
  assert.strictEqual(m.visible, false);
  moments.updateMoment(state, m.id, { visible: true });
  assert.strictEqual(m.visible, true);
});

test("removing a moment drops it from the timeline", () => {
  const state = moments.createMomentsState(600);
  const a = moments.addMoment(state, "title", 0);
  moments.addMoment(state, "caption", 10);
  assert.strictEqual(moments.removeMoment(state, a.id), true);
  assert.strictEqual(state.moments.length, 1);
  assert.strictEqual(moments.removeMoment(state, "nope"), false);
});

test("a moment with no text is invalid with a creator-facing message", () => {
  const state = moments.createMomentsState(600);
  const m = moments.addMoment(state, "caption", 30, { text: "   " });
  const result = moments.validateMoment(m, state.durationSeconds);
  assert.strictEqual(result.ok, false);
  assert.ok(/caption/i.test(result.error));
});

test("the timeline is sorted by time and resolves speaker names", () => {
  const state = moments.createMomentsState(600);
  moments.addMoment(state, "caption", 120, { speakerRole: "Guest 1" });
  moments.addMoment(state, "title", 0, { text: "Intro" });
  moments.addMoment(state, "callout", 60, { speakerRole: "Host" });

  const timeline = moments.buildTimeline(state, SPEAKERS);
  assert.deepStrictEqual(timeline.map((t) => t.timecode), ["0:00", "1:00", "2:00"]);
  // Speaker-aware moments carry the resolved name; the title does not.
  assert.strictEqual(timeline[0].speakerName, "");
  assert.strictEqual(timeline[1].speakerName, "Sam Rivera");
  assert.strictEqual(timeline[2].speakerName, "Dana Kim");
  // Position is a 0..1 fraction for placing the marker on a track.
  assert.ok(timeline[2].position > 0 && timeline[2].position <= 1);
});

test("previewMoment describes the on-screen treatment using the applied caption style", () => {
  const state = moments.createMomentsState(600);
  const m = moments.addMoment(state, "caption", 30, { speakerRole: "Host", text: "Hello" });
  const preview = moments.previewMoment(state, m.id, { speakers: SPEAKERS, captionStyle: "Big animated captions" });
  assert.strictEqual(preview.text, "Hello");
  assert.strictEqual(preview.speakerName, "Sam Rivera");
  assert.ok(/big animated captions/i.test(preview.treatment));

  const title = moments.addMoment(state, "title", 0, { text: "Chapter 1" });
  assert.ok(/title card/i.test(moments.previewMoment(state, title.id, {}).treatment));
});

test("summarizeMoments counts totals, visibility, and types used", () => {
  const state = moments.createMomentsState(600);
  moments.addMoment(state, "caption", 10);
  moments.addMoment(state, "caption", 20);
  const hidden = moments.addMoment(state, "broll", 30);
  moments.toggleVisible(state, hidden.id);

  const summary = moments.summarizeMoments(state);
  assert.strictEqual(summary.total, 3);
  assert.strictEqual(summary.visible, 2);
  assert.strictEqual(summary.hidden, 1);
  assert.strictEqual(summary.byType.caption, 2);
  assert.strictEqual(summary.byType.broll, 1);
  assert.deepStrictEqual(summary.typesUsed.sort(), ["broll", "caption"]);
});

// End-to-end acceptance: a real episode feeds the moments editor, the creator adds all four
// moment types, edits one, previews it, and the timeline persists across a navigation cycle
// (the same state object the UI keeps when leaving and re-entering the editor).
test("ACCEPTANCE: build a deliberately produced episode with all four moment types", () => {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal", fileName: "marco.mp4" }),
  ];
  assert.strictEqual(setup.validateDraft(draft).ok, true);
  const episode = setup.summarize(draft);

  // Move from the episode into the moments editor and add a moment of each type.
  const state = moments.createMomentsState(60 * 50); // ~50 minute long-form episode
  moments.addMoment(state, "title", 0, { text: "Cold open: Building in public" });
  const caption = moments.addMoment(state, "caption", 90, { speakerRole: "Host", text: "Welcome back" });
  moments.addMoment(state, "broll", 300, { text: "Screen recording of the dashboard" });
  moments.addMoment(state, "callout", 1200, { speakerRole: "Guest 1", text: "@danakim" });

  const summary = moments.summarizeMoments(state);
  assert.strictEqual(summary.total, 4);
  assert.strictEqual(summary.typesUsed.length, 4, "all four moment types are in use");

  // Edit one moment's timing and text, then preview how it lands on screen.
  moments.updateMoment(state, caption.id, { atSeconds: 95, text: "Welcome back to the show" });
  const preview = moments.previewMoment(state, caption.id, {
    speakers: episode.speakers,
    captionStyle: "Bold lower-third",
  });
  assert.strictEqual(preview.timecode, "1:35");
  assert.strictEqual(preview.speakerName, "Sam Rivera");
  assert.ok(/bold lower-third/i.test(preview.treatment));

  // The timeline is speaker-aware and ordered, and the same state survives navigating away
  // and back (the UI holds this object across views — nothing is recomputed or lost).
  const timeline = moments.buildTimeline(state, episode.speakers);
  assert.deepStrictEqual(timeline.map((t) => t.typeLabel), [
    "Title moment",
    "Caption",
    "B-roll overlay",
    "Visual callout",
  ]);
  assert.strictEqual(timeline[1].speakerName, "Sam Rivera");
  assert.strictEqual(moments.summarizeMoments(state).total, 4, "moments persist");
});

console.log(`\nepisode moments: ${passed} assertions passed`);

"use strict";

// Preset style selection smoke suite for Podcast Design Canvas (#4).
// Run with: `node tests/preset-styles.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const styles = require("../app/preset-styles.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function episodeSummary() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers[0].name = "Sam Rivera";
  draft.speakers[0].role = "Host";
  draft.speakers[0].fileName = "sam.mp4";
  draft.speakers[1].name = "Dana Kim";
  draft.speakers[1].role = "Guest 1";
  draft.speakers[1].fileName = "dana.mp4";
  draft.speakers[2].name = "Marco Vidal";
  draft.speakers[2].role = "Guest 2";
  draft.speakers[2].fileName = "marco.mp4";
  return setup.summarize(draft);
}

test("at least three distinct visual presets are available", () => {
  assert.ok(styles.PRESETS.length >= 3);
  const keys = new Set(styles.PRESETS.map((p) => p.key));
  assert.strictEqual(keys.size, styles.PRESETS.length, "preset keys must be unique");
  const labels = new Set(styles.PRESETS.map((p) => p.label));
  assert.strictEqual(labels.size, styles.PRESETS.length, "preset labels must be unique");
});

test("a fresh style draft has layout and pacing defaults but no preset yet", () => {
  const draft = styles.createDraft();
  assert.strictEqual(draft.presetKey, "");
  assert.strictEqual(draft.layout, "balanced");
  assert.strictEqual(draft.pacing, "conversational");
});

test("validation requires a chosen preset before continuing", () => {
  const result = styles.validateDraft(styles.createDraft());
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.presetKey);
});

test("each preset produces a different preview accent and frame placement", () => {
  const summary = episodeSummary();
  const previews = styles.PRESETS.map((preset) => {
    const draft = styles.createDraft();
    draft.presetKey = preset.key;
    return styles.buildPreview(draft, summary);
  });

  previews.forEach((preview) => {
    assert.ok(preview.preset, "expected a preset in preview");
    assert.strictEqual(preview.frames.length, 3);
    assert.ok(preview.frames.some((f) => f.role === "Host"));
    assert.ok(preview.frames.some((f) => f.role === "Guest 1"));
    assert.ok(preview.frames.some((f) => f.role === "Guest 2"));
  });

  const accents = new Set(previews.map((p) => p.preset.accent));
  assert.strictEqual(accents.size, 3, "presets should look visually distinct");
});

test("layout and pacing choices change the preview metadata", () => {
  const summary = episodeSummary();
  const base = styles.createDraft();
  base.presetKey = "conversation-split";

  const wide = styles.buildPreview(Object.assign({}, base, { layout: "wide" }), summary);
  const hostLed = styles.buildPreview(Object.assign({}, base, { layout: "host-emphasis" }), summary);
  assert.notStrictEqual(wide.layout, hostLed.layout);
  assert.strictEqual(wide.layoutLabel, "Wide cinematic");
  assert.strictEqual(hostLed.layoutLabel, "Host emphasis");

  const relaxed = styles.buildPreview(Object.assign({}, base, { pacing: "relaxed" }), summary);
  const energetic = styles.buildPreview(Object.assign({}, base, { pacing: "energetic" }), summary);
  assert.strictEqual(relaxed.pacingLabel, "Relaxed");
  assert.strictEqual(energetic.pacingLabel, "Energetic");
});

test("preview frames use speaker names and role buckets from episode setup", () => {
  const summary = episodeSummary();
  const draft = styles.createDraft();
  draft.presetKey = "gallery-grid";
  const preview = styles.buildPreview(draft, summary);
  const names = preview.frames.map((f) => f.name).sort();
  assert.deepStrictEqual(names, ["Dana Kim", "Marco Vidal", "Sam Rivera"]);
  const roles = preview.frames.map((f) => f.role).sort();
  assert.deepStrictEqual(roles, ["Guest 1", "Guest 2", "Host"]);
});

test("summarize captures the applied style for the workspace", () => {
  const summary = episodeSummary();
  const draft = styles.createDraft();
  draft.presetKey = "studio-spotlight";
  draft.layout = "host-emphasis";
  draft.pacing = "energetic";
  const applied = styles.summarize(draft, summary);
  assert.strictEqual(applied.applied, true);
  assert.strictEqual(applied.presetLabel, "Studio Spotlight");
  assert.strictEqual(applied.layoutLabel, "Host emphasis");
  assert.strictEqual(applied.pacingLabel, "Energetic");
  assert.strictEqual(applied.speakerCount, 3);
  assert.ok(applied.frames.length === 3);
});

// End-to-end acceptance walkthrough for issue #4.
test("ACCEPTANCE: choose a preset, tune options, preview speakers, and apply style", () => {
  const summary = episodeSummary();
  const draft = styles.createDraft();

  // Creator browses presets — at least three distinct options exist.
  assert.ok(styles.PRESETS.length >= 3);

  // Select one and adjust layout + pacing.
  draft.presetKey = "conversation-split";
  draft.layout = "balanced";
  draft.pacing = "conversational";
  const validation = styles.validateDraft(draft);
  assert.strictEqual(validation.ok, true, JSON.stringify(validation.errors));

  // Preview reflects Host / Guest buckets with real names.
  const preview = styles.buildPreview(draft, summary);
  assert.strictEqual(preview.frames.length, summary.speakerCount);
  assert.deepStrictEqual(
    preview.frames.map((f) => f.role).sort(),
    ["Guest 1", "Guest 2", "Host"],
  );

  // Applied summary is ready for the episode workspace.
  const applied = styles.summarize(draft, summary);
  assert.strictEqual(applied.presetKey, "conversation-split");
  assert.strictEqual(applied.episodeName, "Founders Unfiltered #7");
  assert.strictEqual(applied.applied, true);
});

console.log(`\npreset styles: ${passed} assertions passed`);

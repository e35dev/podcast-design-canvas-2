"use strict";

// Canvas editor smoke suite for Podcast Design Canvas (#11).
// Guards the documented acceptance: open the chosen preset as a canvas editor, customize at
// least one layout element without editing code, save the result as a named reusable show
// template, and reselect that template for a future episode.
// Run with: `node tests/canvas-editor.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const canvas = require("../app/canvas-editor.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

// A completed setup + applied style, the real inputs the editor opens from.
function appliedEpisode() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal", fileName: "marco.mp4" }),
  ];
  const summary = setup.summarize(draft);
  const selection = style.applyPresetToSelection(style.createSelection(), "panel-grid", false);
  const applied = style.summarizeStyle(selection, summary.speakerCount);
  return { summary, applied };
}

test("opens the chosen preset as a starting point with a frame per real speaker", () => {
  const { summary, applied } = appliedEpisode();
  const design = canvas.openDesign(applied, summary);
  assert.strictEqual(design.presetName, "Panel Grid");
  assert.strictEqual(design.background, applied.background, "starts from the preset background");
  assert.strictEqual(design.frames.length, 3, "one frame per assigned speaker");
  assert.deepStrictEqual(design.frames.map((f) => f.role), ["Host", "Guest 1", "Guest 2"]);
  assert.deepStrictEqual(design.frames.map((f) => f.label), ["Sam Rivera", "Dana Kim", "Marco Vidal"]);
  assert.strictEqual(design.title.text, "Founders Unfiltered #7", "title seeds from the episode name");
});

test("describeElements lists every customizable layout element", () => {
  const { summary, applied } = appliedEpisode();
  const design = canvas.openDesign(applied, summary);
  const ids = canvas.describeElements(design).map((e) => e.id);
  assert.ok(ids.includes("background"));
  assert.ok(ids.includes("title"));
  assert.ok(ids.includes("caption"));
  assert.ok(ids.includes("overlay"));
  assert.ok(ids.includes("frame:0") && ids.includes("frame:2"), "speaker frames are editable elements");
});

test("a creator can change layout elements without editing code", () => {
  const { summary, applied } = appliedEpisode();
  const design = canvas.openDesign(applied, summary);

  canvas.setBackground(design, "#123456");
  assert.strictEqual(design.background, "#123456");
  canvas.setBackground(design, "not-a-color");
  assert.strictEqual(design.background, "#123456", "an invalid color is ignored");

  canvas.setTitleText(design, "Season 2 Premiere");
  assert.strictEqual(design.title.text, "Season 2 Premiere");

  canvas.setOverlayText(design, "@foundersunfiltered");
  canvas.toggleElement(design, "overlay");
  const overlay = canvas.describeElements(design).find((e) => e.id === "overlay");
  assert.strictEqual(overlay.value, "@foundersunfiltered");
  assert.strictEqual(overlay.visible, true, "overlay can be turned on");

  canvas.setFrameLabel(design, 1, "Dana K.");
  assert.strictEqual(design.frames[1].label, "Dana K.");
});

test("the layout always keeps at least one speaker frame labelled", () => {
  const { summary, applied } = appliedEpisode();
  const design = canvas.openDesign(applied, summary);
  canvas.toggleElement(design, "frame:0");
  canvas.toggleElement(design, "frame:1");
  canvas.toggleElement(design, "frame:2"); // would hide the last one
  const visible = design.frames.filter((f) => f.showLabel).length;
  assert.ok(visible >= 1, "cannot hide every speaker frame");
});

test("validateTemplateName requires a non-empty, unique name", () => {
  assert.strictEqual(canvas.validateTemplateName("", []).ok, false);
  assert.strictEqual(canvas.validateTemplateName("My Show", []).ok, true);
  assert.strictEqual(canvas.validateTemplateName("My Show", ["my show"]).ok, false, "name match is case-insensitive");
});

test("saving stores a named template that can be listed and fetched back", () => {
  const { summary, applied } = appliedEpisode();
  const design = canvas.openDesign(applied, summary);
  canvas.setBackground(design, "#222244");
  const store = canvas.createTemplateStore();

  const result = store.save("Founders Look", design);
  assert.strictEqual(result.ok, true);
  assert.ok(result.template.id, "a saved template has an id");
  assert.strictEqual(store.list().length, 1);
  assert.strictEqual(store.list()[0].name, "Founders Look");

  const fetched = store.get(result.template.id);
  assert.strictEqual(fetched.design.background, "#222244", "the customized look is preserved");

  const dup = store.save("Founders Look", design);
  assert.strictEqual(dup.ok, false, "a duplicate name is rejected");
});

test("a saved template persists in injected storage across editor sessions", () => {
  const backing = {};
  const storageA = {
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
  };
  const { summary, applied } = appliedEpisode();
  const design = canvas.openDesign(applied, summary);
  canvas.createTemplateStore(storageA).save("Persisted Show", design);

  // A new store over the same backing storage — i.e. a later visit — still sees it.
  const storageB = {
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
  };
  const reopened = canvas.createTemplateStore(storageB);
  assert.strictEqual(reopened.list().length, 1);
  assert.strictEqual(reopened.list()[0].name, "Persisted Show");
});

test("reselecting a template reuses the saved identity but adapts to new speakers", () => {
  const first = appliedEpisode();
  const design = canvas.openDesign(first.applied, first.summary);
  canvas.setBackground(design, "#0b1d33");
  canvas.setTitleText(design, "The Founders Show");
  canvas.setOverlayText(design, "@founders");
  canvas.toggleElement(design, "overlay");
  canvas.toggleElement(design, "frame:1"); // hide the Guest 1 nameplate as a saved choice
  const store = canvas.createTemplateStore();
  const saved = store.save("Founders Identity", design).template;

  // A future episode with different speakers reuses the saved template.
  const nextDraft = setup.createDraft();
  nextDraft.episodeName = "Founders Unfiltered #8";
  nextDraft.sourceMode = "upload";
  nextDraft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Priya Anand", fileName: "priya.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Leo Park", fileName: "leo.mp4" }),
  ];
  const nextSummary = setup.summarize(nextDraft);

  const reused = canvas.applyTemplate(store.get(saved.id), nextSummary);
  assert.strictEqual(reused.background, "#0b1d33", "keeps the saved background");
  assert.strictEqual(reused.title.text, "The Founders Show", "keeps the saved title");
  assert.strictEqual(reused.overlay.visible, true, "keeps the saved overlay");
  assert.strictEqual(reused.frames.length, 2, "adapts to the new episode's speaker count");
  assert.deepStrictEqual(reused.frames.map((f) => f.name), ["Priya Anand", "Leo Park"]);
  // Frame labels come from the new speakers (names are episode-specific)...
  assert.deepStrictEqual(reused.frames.map((f) => f.label), ["Priya Anand", "Leo Park"]);
  // ...while the saved structural choice (Guest 1 nameplate hidden) carries to the same role.
  assert.strictEqual(reused.frames[0].showLabel, true, "Host nameplate stays shown");
  assert.strictEqual(reused.frames[1].showLabel, false, "saved hidden-nameplate choice carries by role");
});

// End-to-end: the documented runnable check for issue #11 — open the editor from a chosen
// style, customize a layout element, save a named template, and reselect it for reuse.
test("ACCEPTANCE: open canvas editor, customize, save a template, reselect it", () => {
  const { summary, applied } = appliedEpisode();

  // Open the canvas editor from the chosen preset style.
  const design = canvas.openDesign(applied, summary);
  assert.ok(design.frames.length > 0, "editor opens on the real episode layout");

  // Change at least one layout element without touching code.
  canvas.setBackground(design, "#171a2e");
  canvas.setTitleText(design, "Deep Dive Mondays");
  assert.strictEqual(canvas.describeElements(design).find((e) => e.id === "background").value, "#171a2e");

  // Save the design as a named reusable show template.
  const store = canvas.createTemplateStore();
  const save = store.save("Deep Dive Look", design);
  assert.strictEqual(save.ok, true);

  // The saved template is available for future episode use, and reselecting restores it.
  assert.strictEqual(store.list().length, 1);
  const reused = canvas.applyTemplate(store.get(save.template.id), summary);
  assert.strictEqual(reused.background, "#171a2e");
  assert.strictEqual(reused.title.text, "Deep Dive Mondays");
});

console.log(`\ncanvas editor: ${passed} assertions passed`);

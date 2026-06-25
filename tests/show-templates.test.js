"use strict";

// Reusable show template smoke suite for Podcast Design Canvas (#27).
// Guards saving a customized layout/style as a named template, listing it, selecting it
// in a new episode, and applying it so the saved visual identity carries forward while
// the preview rebinds to the CURRENT episode's assigned speakers.
// Run with: `node tests/show-templates.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const editor = require("../app/canvas-editor.js");
const templates = require("../app/show-templates.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function episodeWith(speakers, name) {
  const draft = setup.createDraft();
  draft.episodeName = name || "Some Episode";
  draft.sourceMode = "upload";
  draft.speakers = speakers.map((s) =>
    Object.assign(setup.createSpeaker(s.role), { name: s.name, fileName: s.file })
  );
  return setup.summarize(draft);
}

// Build a saved template from a fully customized canvas for a first episode.
function buildSavedTemplate(store, name, id) {
  const firstEpisode = episodeWith(
    [
      { role: "Host", name: "Sam Rivera", file: "sam.mp4" },
      { role: "Guest 1", name: "Dana Kim", file: "dana.mp4" },
      { role: "Guest 2", name: "Marco Vidal", file: "marco.mp4" },
    ],
    "Founders Unfiltered #7"
  );
  const selection = style.createSelection();
  selection.presetId = "panel-grid";
  const applied = style.summarizeStyle(selection, firstEpisode.speakerCount);
  let doc = editor.createFromStyle(applied, firstEpisode, selection);
  doc = editor.updateElement(doc, "titleText", "Founders Unfiltered Show");
  doc = editor.updateElement(doc, "background", "#101820");
  const template = templates.createTemplate(name, doc, id);
  return { store: templates.saveTemplate(store, template), template, firstEpisode };
}

test("saveTemplate stores a named template and listTemplates surfaces it", () => {
  templates._resetTemplateCounter();
  let store = templates.createStore();
  const built = buildSavedTemplate(store, "Founders Unfiltered", "tpl-a");
  store = built.store;

  const list = templates.listTemplates(store);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, "Founders Unfiltered");
  assert.strictEqual(list[0].presetName, "Panel Grid");
  assert.strictEqual(list[0].titleText, "Founders Unfiltered Show");
});

test("validateTemplateName blocks blanks and duplicates", () => {
  templates._resetTemplateCounter();
  let store = templates.createStore();
  store = buildSavedTemplate(store, "Weeknight Live", "tpl-w").store;
  assert.strictEqual(templates.validateTemplateName(store, "").ok, false);
  assert.strictEqual(templates.validateTemplateName(store, "Weeknight Live").ok, false);
  assert.strictEqual(templates.validateTemplateName(store, "Weeknight Live", "tpl-w").ok, true, "same id may keep its name");
  assert.strictEqual(templates.validateTemplateName(store, "Sunday Recap").ok, true);
});

test("applyTemplate alone returns the saved canvas unchanged (original cast)", () => {
  templates._resetTemplateCounter();
  let store = templates.createStore();
  store = buildSavedTemplate(store, "Founders Unfiltered", "tpl-a").store;
  const saved = templates.getTemplate(store, "tpl-a");
  const canvas = templates.applyTemplate(saved);
  assert.deepStrictEqual(canvas.speakerFrames.map((f) => f.name), ["Sam Rivera", "Dana Kim", "Marco Vidal"]);
});

test("applyTemplateToEpisode keeps visual identity but rebinds to the new episode's speakers", () => {
  templates._resetTemplateCounter();
  let store = templates.createStore();
  store = buildSavedTemplate(store, "Founders Unfiltered", "tpl-a").store;
  const saved = templates.getTemplate(store, "tpl-a");

  // A brand-new episode with a completely different cast.
  const newEpisode = episodeWith(
    [
      { role: "Host", name: "Priya Patel", file: "priya.mp4" },
      { role: "Guest 1", name: "Tom Lee", file: "tom.mp4" },
    ],
    "Founders Unfiltered #8"
  );

  const selection = style.createSelection();
  const canvas = templates.applyTemplateToEpisode(saved, newEpisode, selection);

  // Visual identity carried forward from the template:
  assert.strictEqual(canvas.presetId, "panel-grid", "preset preserved");
  assert.strictEqual(canvas.background, "#101820", "custom background preserved");
  assert.strictEqual(canvas.titleText, "Founders Unfiltered Show", "show title preserved");
  assert.ok(canvas.layers.length >= 5, "layer stack preserved");

  // Speakers rebound to the CURRENT episode:
  assert.strictEqual(canvas.speakerFrames.length, 2, "frame count matches new episode");
  assert.deepStrictEqual(canvas.speakerFrames.map((f) => f.name), ["Priya Patel", "Tom Lee"]);
  assert.deepStrictEqual(canvas.speakerFrames.map((f) => f.role), ["Host", "Guest 1"]);
});

test("applyTemplateToEpisode does not mutate the stored template", () => {
  templates._resetTemplateCounter();
  let store = templates.createStore();
  store = buildSavedTemplate(store, "Founders Unfiltered", "tpl-a").store;
  const saved = templates.getTemplate(store, "tpl-a");

  const newEpisode = episodeWith([{ role: "Host", name: "Solo Host", file: "solo.mp4" }], "Solo Show");
  templates.applyTemplateToEpisode(saved, newEpisode, style.createSelection());

  // The store's copy still has the original three-person cast.
  const reread = templates.getTemplate(store, "tpl-a");
  assert.deepStrictEqual(reread.canvas.speakerFrames.map((f) => f.name), ["Sam Rivera", "Dana Kim", "Marco Vidal"]);
});

test("applyTemplateToEpisode returns null for a missing template", () => {
  assert.strictEqual(templates.applyTemplateToEpisode(null, episodeWith([]), {}), null);
});

test("applyTemplateToEpisode without a style selection still rebinds speakers via the saved layout", () => {
  templates._resetTemplateCounter();
  let store = templates.createStore();
  store = buildSavedTemplate(store, "Founders Unfiltered", "tpl-a").store;
  const saved = templates.getTemplate(store, "tpl-a");

  const newEpisode = episodeWith(
    [
      { role: "Host", name: "Ana Diaz", file: "ana.mp4" },
      { role: "Guest 1", name: "Ben Cole", file: "ben.mp4" },
    ],
    "Episode N"
  );
  const canvas = templates.applyTemplateToEpisode(saved, newEpisode);
  assert.deepStrictEqual(canvas.speakerFrames.map((f) => f.name), ["Ana Diaz", "Ben Cole"]);
});

// End-to-end: design a show on episode 1, save it, start episode 2 with a new cast,
// pick the saved template, and confirm the look carries over while speakers update.
test("ACCEPTANCE: save a show template, reuse it on a new episode keeping current speakers", () => {
  templates._resetTemplateCounter();
  let store = templates.createStore();

  // Episode 1 — design and save.
  const built = buildSavedTemplate(store, "The Build Show", "tpl-build");
  store = built.store;
  assert.strictEqual(templates.listTemplates(store).length, 1, "template appears in the library");

  // Episode 2 — new setup, different speakers.
  const episode2 = episodeWith(
    [
      { role: "Host", name: "Jordan Fox", file: "jordan.mp4" },
      { role: "Guest 1", name: "Wei Zhang", file: "wei.mp4" },
      { role: "Guest 2", name: "Nora Hsu", file: "nora.mp4" },
    ],
    "The Build Show — Episode 2"
  );
  assert.strictEqual(episode2.speakerCount, 3);

  // Select the saved template in the new episode.
  const selected = templates.getTemplate(store, "tpl-build");
  assert.ok(selected, "saved template selectable for the new episode");

  // Apply it — show identity in, current speakers in.
  const canvas = templates.applyTemplateToEpisode(selected, episode2, style.createSelection());
  assert.strictEqual(canvas.presetName, "Panel Grid", "show style preserved");
  assert.strictEqual(canvas.titleText, "Founders Unfiltered Show", "saved title preserved");
  assert.strictEqual(canvas.background, "#101820", "saved palette preserved");
  assert.deepStrictEqual(
    canvas.speakerFrames.map((f) => f.name),
    ["Jordan Fox", "Wei Zhang", "Nora Hsu"],
    "preview rebinds to the current episode's speakers"
  );
});

console.log(`\nshow templates: ${passed} assertions passed`);

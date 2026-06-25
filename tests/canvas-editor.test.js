"use strict";

// Canvas editor smoke suite for Podcast Design Canvas (#11).
// Guards the documented acceptance for the reusable canvas editor: open the editor from a
// chosen preset style, change at least one layout element, save the design as a named show
// template, and reselect that template for a future episode's real speakers.
// Run with: `node tests/canvas-editor.test.js`.

const assert = require("assert");
const canvas = require("../app/canvas-editor.js");
const style = require("../app/episode-style.js");
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

test("opens the canvas editor from a chosen preset with the real speakers", () => {
  const preset = style.getPreset("split-stage");
  const design = canvas.createDesign(preset, SPEAKERS);

  // The design starts from the preset's identity...
  assert.strictEqual(design.presetId, "split-stage");
  assert.strictEqual(design.background, preset.background);
  assert.strictEqual(design.accent, preset.accent);
  assert.strictEqual(design.layout, preset.defaultLayout);
  assert.strictEqual(design.caption.style, preset.captionStyle);

  // ...and draws one frame per assigned speaker, in setup order.
  assert.deepStrictEqual(design.frames.map((f) => f.name), ["Sam Rivera", "Dana Kim", "Marco Vidal"]);
  assert.ok(design.frames.every((f) => f.visible), "all speaker frames start visible");
});

test("the editor exposes every adjustable layout element", () => {
  const design = canvas.createDesign(style.getPreset("studio-spotlight"), SPEAKERS);
  const elements = canvas.elementList(design);
  const kinds = new Set(elements.map((e) => e.kind));
  ["background", "frame", "title", "caption", "overlay"].forEach((kind) => {
    assert.ok(kinds.has(kind), `editor exposes a ${kind} element`);
  });
  // One row per speaker frame plus the four single elements.
  assert.strictEqual(elements.filter((e) => e.kind === "frame").length, 3);
});

test("changing layout elements is reflected in the design (no code editing)", () => {
  const design = canvas.createDesign(style.getPreset("studio-spotlight"), SPEAKERS);

  canvas.setBackground(design, "#222244");
  assert.strictEqual(design.background, "#222244");

  canvas.setTitleText(design, "Founders Unfiltered");
  assert.strictEqual(design.title.text, "Founders Unfiltered");

  // Toggle an overlay area on and a speaker frame off.
  assert.strictEqual(design.overlay.visible, false);
  canvas.toggleSection(design, "overlay");
  assert.strictEqual(design.overlay.visible, true);

  canvas.toggleFrame(design, 2);
  assert.strictEqual(design.frames[2].visible, false);

  const summary = canvas.summarizeDesign(design);
  assert.strictEqual(summary.visibleFrames, 2);
  assert.strictEqual(summary.totalFrames, 3);
  assert.strictEqual(summary.overlayOn, true);
  assert.strictEqual(summary.titleText, "Founders Unfiltered");
});

test("an empty background or title leaves a sensible value (no broken state)", () => {
  const design = canvas.createDesign(style.getPreset("panel-grid"), SPEAKERS);
  const original = design.background;
  canvas.setBackground(design, "   ");
  assert.strictEqual(design.background, original, "blank color keeps the prior background");
  canvas.setTitleText(design, "");
  assert.strictEqual(design.title.text, "");
});

test("saving a design stores a named, reusable template", () => {
  const store = canvas.createTemplateStore();
  const design = canvas.createDesign(style.getPreset("bold-broadcast"), SPEAKERS);
  canvas.setTitleText(design, "The Build Hour");

  const result = canvas.saveTemplate(store, "Build Hour Look", design);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.template.name, "Build Hour Look");

  const templates = canvas.listTemplates(store);
  assert.strictEqual(templates.length, 1);
  assert.strictEqual(templates[0].title.text, "The Build Hour");
  // Speaker names are not baked into the template — only reusable identity is kept.
  assert.ok(!JSON.stringify(templates[0]).includes("Sam Rivera"), "template is speaker-agnostic");
});

test("a template needs a name before it can be saved", () => {
  const store = canvas.createTemplateStore();
  const design = canvas.createDesign(style.getPreset("split-stage"), SPEAKERS);
  const result = canvas.saveTemplate(store, "   ", design);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error, "a creator-facing reason is returned");
  assert.strictEqual(canvas.listTemplates(store).length, 0);
});

test("reusing the same template name updates it in place", () => {
  const store = canvas.createTemplateStore();
  const design = canvas.createDesign(style.getPreset("studio-spotlight"), SPEAKERS);
  canvas.saveTemplate(store, "My Show", design);
  canvas.setBackground(design, "#001122");
  canvas.saveTemplate(store, "My Show", design);
  const templates = canvas.listTemplates(store);
  assert.strictEqual(templates.length, 1, "no duplicate templates");
  assert.strictEqual(templates[0].background, "#001122");
});

test("a saved template reselected for a new episode adapts to its speakers", () => {
  const store = canvas.createTemplateStore();
  const made = canvas.createDesign(style.getPreset("panel-grid"), SPEAKERS);
  canvas.setTitleText(made, "Roundtable");
  canvas.toggleFrame(made, 1); // hide the Guest 1 frame in the template
  const saved = canvas.saveTemplate(store, "Roundtable Identity", made).template;

  // A different, future episode with different people.
  const futureSpeakers = [
    { role: "Host", name: "Priya Anand" },
    { role: "Guest 1", name: "Leo Park" },
  ];
  const reused = canvas.applyTemplate(canvas.getTemplate(store, saved.id), futureSpeakers);

  // Identity carries over...
  assert.strictEqual(reused.presetId, "panel-grid");
  assert.strictEqual(reused.layout, "grid");
  assert.strictEqual(reused.title.text, "Roundtable");
  // ...but the frames are this episode's real speakers, with the hidden Guest 1 honored.
  assert.deepStrictEqual(reused.frames.map((f) => f.name), ["Priya Anand", "Leo Park"]);
  assert.strictEqual(reused.frames.find((f) => f.role === "Guest 1").visible, false);
  assert.strictEqual(reused.frames.find((f) => f.role === "Host").visible, true);
});

// End-to-end: setup → preset choice → open canvas editor → customize → save template →
// reselect it. This is the runnable check the active step (#11) asks for.
test("ACCEPTANCE: open the canvas editor from a style, customize, save and reselect a template", () => {
  // 1. Create a real episode setup.
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

  // 2. Choose a preset style.
  const selection = style.createSelection();
  selection.presetId = "split-stage";

  // 3. Open the canvas editor from that style.
  const design = canvas.createDesign(style.getPreset(selection.presetId), episode.speakers);
  assert.deepStrictEqual(design.frames.map((f) => f.role), ["Host", "Guest 1", "Guest 2"]);

  // 4. Visibly customize layout elements without editing code.
  canvas.setBackground(design, "#0d1b2a");
  canvas.setTitleText(design, "Founders Unfiltered");
  canvas.toggleSection(design, "overlay");
  const beforeSummary = canvas.summarizeDesign(design);
  assert.strictEqual(beforeSummary.background, "#0d1b2a");
  assert.strictEqual(beforeSummary.overlayOn, true);

  // 5. Save it as a named reusable show template.
  const store = canvas.createTemplateStore();
  const saved = canvas.saveTemplate(store, "Founders Show", design);
  assert.strictEqual(saved.ok, true);
  assert.strictEqual(canvas.listTemplates(store).length, 1);

  // 6. The saved template is available for a future episode.
  const futureDraft = setup.createDraft();
  futureDraft.episodeName = "Founders Unfiltered #8";
  futureDraft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Ada Lin" }),
  ];
  const futureEpisode = setup.summarize(futureDraft);
  const reused = canvas.applyTemplate(canvas.getTemplate(store, saved.template.id), futureEpisode.speakers);
  assert.strictEqual(reused.title.text, "Founders Unfiltered");
  assert.strictEqual(reused.background, "#0d1b2a");
  assert.deepStrictEqual(reused.frames.map((f) => f.name), ["Sam Rivera", "Ada Lin"]);
});

console.log(`\ncanvas editor: ${passed} assertions passed`);

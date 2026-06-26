"use strict";

// Saved template / show identity must not overwrite current episode speakers (#182).
// Run with: `node tests/template-speaker-preservation.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const editor = require("../app/canvas-editor.js");
const audio = require("../app/audio-polish.js");
const moments = require("../app/visual-moments.js");
const review = require("../app/publish-review.js");
const exportApi = require("../app/episode-export.js");
const templates = require("../app/show-templates.js");
const identity = require("../app/show-identity.js");
const library = require("../app/show-library.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function templateEpisodeDraft() {
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

function currentEpisodeDraft() {
  const draft = setup.createDraft();
  draft.episodeName = "Agency Weekly #12";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Alex Chen", fileName: "alex.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Jordan Lee", fileName: "jordan.mp4" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Casey Park", fileName: "casey.mp4" }),
  ];
  return draft;
}

function speakerNames(draft) {
  return draft.speakers.map((speaker) => speaker.name);
}

function saveTemplateFromDraft(draft) {
  const episode = setup.summarize(draft);
  const selection = style.createSelection();
  selection.presetId = "split-stage";
  selection.layout = "split";
  const applied = style.summarizeStyle(selection, episode.speakerCount);
  let doc = editor.createFromStyle(applied, episode, selection);
  doc = editor.updateElement(doc, "titleText", "Founders Split Layout");
  let store = templates.createStore();
  store = templates.saveTemplate(store, templates.createTemplate("Founders Split", doc, "tpl-founders-split"));
  return { store, template: templates.getTemplate(store, "tpl-founders-split") };
}

test("applyTemplateToEpisode preserves assigned speakers while applying layout and style", () => {
  templates._resetTemplateCounter();
  const { store, template } = saveTemplateFromDraft(templateEpisodeDraft());
  const draft = currentEpisodeDraft();
  const show = library.createShow("Agency Weekly", {
    templateId: template.id,
    templateName: template.name,
    defaultSpeakers: templateEpisodeDraft().speakers.map((speaker) => ({
      role: speaker.role,
      name: speaker.name,
      social: speaker.social,
    })),
  });

  const applied = identity.applyTemplateToEpisode(show, store, draft, { templateId: template.id });
  assert.deepStrictEqual(speakerNames(draft), ["Alex Chen", "Jordan Lee", "Casey Park"]);
  assert.deepStrictEqual(speakerNames(applied.setupDraft), ["Alex Chen", "Jordan Lee", "Casey Park"]);
  assert.strictEqual(applied.templateId, template.id);
  assert.strictEqual(applied.canvasDoc.titleText, "Founders Split Layout");
  assert.deepStrictEqual(
    applied.canvasDoc.speakerFrames.map((frame) => frame.name),
    ["Alex Chen", "Jordan Lee", "Casey Park"],
  );
  assert.notStrictEqual(applied.appliedStyle.presetName, "");
});

test("buildEpisodeStart keeps blank speaker buckets for a new episode even when show defaults exist", () => {
  library._resetCounters();
  templates._resetTemplateCounter();
  const { store, template } = saveTemplateFromDraft(templateEpisodeDraft());
  const show = library.createShow("Agency Weekly", {
    templateId: template.id,
    templateName: template.name,
    defaultSpeakers: templateEpisodeDraft().speakers.map((speaker) => ({
      role: speaker.role,
      name: speaker.name,
    })),
  });

  const start = identity.buildEpisodeStart(show, store);
  assert.deepStrictEqual(speakerNames(start.setupDraft), ["Sam Rivera", "Dana Kim", "Marco Vidal"]);
});

test("ACCEPTANCE: applying a saved template with different original speakers keeps current cast", () => {
  templates._resetTemplateCounter();
  const { store, template } = saveTemplateFromDraft(templateEpisodeDraft());
  const draft = currentEpisodeDraft();
  const episode = setup.summarize(draft);
  const show = library.createShow("Agency Weekly", {
    templateId: template.id,
    templateName: template.name,
    defaultSpeakers: templateEpisodeDraft().speakers.map((speaker) => ({
      role: speaker.role,
      name: speaker.name,
    })),
  });

  const applied = identity.applyTemplateToEpisode(show, store, draft, { templateId: template.id });
  const preserved = setup.summarize(applied.setupDraft);

  assert.deepStrictEqual(speakerNames(applied.setupDraft), ["Alex Chen", "Jordan Lee", "Casey Park"]);
  assert.deepStrictEqual(
    applied.canvasDoc.speakerFrames.map((frame) => frame.name),
    ["Alex Chen", "Jordan Lee", "Casey Park"],
  );

  const polish = audio.createPolish(preserved);
  assert.strictEqual(polish.speakers[0].name, "Alex Chen");
  assert.strictEqual(polish.speakers[1].name, "Jordan Lee");

  const board = moments.createBoard(preserved);
  assert.strictEqual(board.transcript[0].speakerName, "Alex Chen");

  const publishReview = review.createReview(preserved, {
    audioPolish: audio.summarizePolish(polish),
    appliedStyle: applied.appliedStyle,
    templateName: template.name,
    hasCanvas: true,
    contextApproved: true,
    momentsSummary: moments.summarizeBoard(board),
    captionCount: 0,
  });
  assert.ok(publishReview.checks.every((check) => !check.id.includes("speaker") || check.passed || check.id !== "speakers-unnamed"));

  assert.deepStrictEqual(
    preserved.speakers.map((speaker) => speaker.name),
    ["Alex Chen", "Jordan Lee", "Casey Park"],
  );

  const exportSummary = exportApi.buildFinalSummary(preserved, {
    audioPolish: audio.summarizePolish(polish),
    appliedStyle: applied.appliedStyle,
    templateName: template.name,
    momentsSummary: moments.summarizeBoard(board),
  }, exportApi.createExport(preserved, { templateName: template.name }));
  const exportText = exportSummary.lines.join("\n");
  assert.ok(exportText.includes("Show template: Founders Split"));
  assert.ok(!exportText.includes("Sam Rivera"));
  assert.ok(!exportText.includes("Dana Kim"));
});

test("UI applySavedTemplate uses applyTemplateToEpisode for show-scoped template apply", () => {
  const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
  const block = ui.slice(ui.indexOf("function applySavedTemplate"), ui.indexOf("function openCanvasEditor"));
  assert.ok(block.includes("applyTemplateToEpisode"));
  assert.ok(!/state\.speakers\s*=\s*[^;]*speakerFrames/.test(block));
});

console.log(`\ntemplate speaker preservation: ${passed} test(s) passed.`);

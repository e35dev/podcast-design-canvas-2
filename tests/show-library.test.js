"use strict";

// Show library smoke suite for Podcast Design Canvas (#47).
// Run with: `node tests/show-library.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const editor = require("../app/canvas-editor.js");
const templates = require("../app/show-templates.js");
const library = require("../app/show-library.js");
const workspace = require("../app/episode-workspace.js");

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
  ];
  return draft;
}

test("validateShowName requires a unique non-empty name", () => {
  library._resetCounters();
  const store = library.createLibrary();
  assert.strictEqual(library.validateShowName(store, "").ok, false);
  const withShow = library.saveShow(store, library.createShow("Agency Weekly", { id: "show-1" }));
  assert.strictEqual(library.validateShowName(withShow, "Agency Weekly").ok, false);
  assert.strictEqual(library.validateShowName(withShow, "Client Show").ok, true);
});

test("listEpisodesForShow returns episodes sorted by most recently updated", () => {
  library._resetCounters();
  let store = library.createLibrary();
  const show = library.createShow("Weekly Show", { id: "show-1" });
  store = library.saveShow(store, show);
  const older = library.createEpisode("show-1", "Episode 1", { id: "ep-1" });
  older.updatedAt = 1000;
  const newer = library.createEpisode("show-1", "Episode 2", { id: "ep-2" });
  newer.updatedAt = 5000;
  store = library.saveEpisode(store, older);
  store = library.saveEpisode(store, newer);
  const list = library.listEpisodesForShow(store, "show-1");
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].name, "Episode 2");
});

test("deriveEpisodeStatus maps workspace progress to creator-facing statuses", () => {
  const episode = setup.summarize(completeUploadDraft());
  const draftWs = workspace.buildWorkspace(episode, {});
  const draftStatus = library.deriveEpisodeStatus(draftWs);
  assert.strictEqual(draftStatus.status, library.EPISODE_STATUS.DRAFT);

  const selection = style.createSelection();
  selection.presetId = "studio-spotlight";
  const ctx = {
    appliedStyle: style.summarizeStyle(selection, episode.speakerCount),
    audioPolish: null,
    templateName: "",
    momentsSummary: { total: 0 },
    contextApproved: true,
    exportReady: false,
    publishReviewApproved: false,
    exportStatus: "draft",
  };
  const inProgressWs = workspace.buildWorkspace(episode, ctx);
  const inProgress = library.deriveEpisodeStatus(inProgressWs);
  assert.strictEqual(inProgress.status, library.EPISODE_STATUS.IN_PROGRESS);
  assert.ok(inProgress.progressLine.indexOf("stages complete") >= 0);

  const exportedCtx = Object.assign({}, ctx, {
    exportReady: true,
    publishReviewApproved: true,
    exportStatus: "ready",
    exportDownloadName: "founders-ep7.mp4",
  });
  const exportedWs = workspace.buildWorkspace(episode, exportedCtx);
  const exported = library.deriveEpisodeStatus(exportedWs);
  assert.strictEqual(exported.status, library.EPISODE_STATUS.EXPORTED);
  assert.strictEqual(exported.statusLabel, "Exported");
});

test("createShowFromTemplate links a saved template and style defaults", () => {
  templates._resetTemplateCounter();
  library._resetCounters();
  const draft = completeUploadDraft();
  const episode = setup.summarize(draft);
  const selection = style.createSelection();
  selection.presetId = "split-stage";
  const applied = style.summarizeStyle(selection, episode.speakerCount);
  let doc = editor.createFromStyle(applied, episode, selection);
  doc = editor.updateElement(doc, "titleText", "Agency Split Layout");
  let templateStore = templates.createStore();
  const template = templates.createTemplate("Agency Split", doc, "tpl-agency");
  templateStore = templates.saveTemplate(templateStore, template);

  let lib = library.createLibrary();
  const created = library.createShowFromTemplate(lib, templateStore, "tpl-agency", "Agency Split Show");
  assert.strictEqual(created.ok, true);
  lib = created.library;
  const summary = library.buildShowSummary(lib, created.show, templateStore);
  assert.strictEqual(summary.templateName, "Agency Split");
  assert.ok(summary.identityLine.indexOf("Split Stage") >= 0);
});

test("buildPrefillFromShow returns template style defaults for a new episode", () => {
  templates._resetTemplateCounter();
  library._resetCounters();
  const draft = completeUploadDraft();
  const episode = setup.summarize(draft);
  const selection = style.createSelection();
  selection.presetId = "panel-grid";
  selection.layout = "grid";
  const applied = style.summarizeStyle(selection, episode.speakerCount);
  let doc = editor.createFromStyle(applied, episode, selection);
  let templateStore = templates.createStore();
  const template = templates.createTemplate("Grid Show", doc, "tpl-grid");
  templateStore = templates.saveTemplate(templateStore, template);

  let lib = library.createLibrary();
  const created = library.createShowFromTemplate(lib, templateStore, "tpl-grid", "Grid Podcast");
  const prefill = library.buildPrefillFromShow(created.show, templateStore);
  assert.strictEqual(prefill.templateId, "tpl-grid");
  assert.strictEqual(prefill.styleSelection.presetId, "panel-grid");
  assert.strictEqual(prefill.styleSelection.layout, "grid");
});

test("ACCEPTANCE: create show, track episode statuses, and prefill a new episode from show defaults", () => {
  templates._resetTemplateCounter();
  library._resetCounters();

  const draftA = completeUploadDraft();
  const episodeA = setup.summarize(draftA);
  const selection = style.createSelection();
  selection.presetId = "studio-spotlight";
  selection.layout = "spotlight";
  const applied = style.summarizeStyle(selection, episodeA.speakerCount);
  let doc = editor.createFromStyle(applied, episodeA, selection);
  doc = editor.updateElement(doc, "titleText", "Founders Spotlight Layout");

  let templateStore = templates.createStore();
  const template = templates.createTemplate("Founders Format", doc, "tpl-founders");
  templateStore = templates.saveTemplate(templateStore, template);

  let lib = library.createLibrary();
  const created = library.createShowFromTemplate(lib, templateStore, "tpl-founders", "Founders Unfiltered");
  assert.strictEqual(created.ok, true);
  lib = created.library;

  let episodeRecord = library.createEpisode(created.show.id, "Episode 7 — Building in Public", { id: "ep-7" });
  lib = library.saveEpisode(lib, episodeRecord);

  const ws = workspace.buildWorkspace(episodeA, {
    appliedStyle: applied,
    audioPolish: null,
    templateName: "Founders Format",
    momentsSummary: { total: 0 },
    contextApproved: true,
    exportReady: false,
    publishReviewApproved: false,
    exportStatus: "draft",
  });
  episodeRecord = library.updateEpisodeProgress(episodeRecord, ws);
  lib = library.saveEpisode(lib, episodeRecord);

  const summary = library.buildShowSummary(lib, created.show, templateStore);
  assert.strictEqual(summary.episodeCount, 1);
  assert.strictEqual(summary.episodes[0].status, library.EPISODE_STATUS.IN_PROGRESS);
  assert.ok(summary.identityLine.indexOf("Studio Spotlight") >= 0);

  const draftB = setup.createDraft();
  draftB.episodeName = "Episode 8 — Launch Week";
  draftB.sourceMode = "upload";
  draftB.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
  ];
  const episodeB = setup.summarize(draftB);
  const prefill = library.buildPrefillFromShow(created.show, templateStore);
  const appliedPrefill = library.applyPrefillToEpisodeState(prefill, episodeB, templateStore);
  assert.strictEqual(appliedPrefill.activeTemplateId, "tpl-founders");
  assert.strictEqual(appliedPrefill.styleSelection.presetId, "studio-spotlight");
  assert.ok(appliedPrefill.canvasDoc);
  assert.strictEqual(appliedPrefill.canvasDoc.speakerFrames.length, 2);
  assert.strictEqual(appliedPrefill.canvasDoc.speakerFrames[0].name, "Sam Rivera");
});

console.log(`\nshow library: ${passed} assertions passed`);

"use strict";

// Show library dashboard smoke suite for Podcast Design Canvas (#47).
// Run with: `node tests/show-library.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const templates = require("../app/show-templates.js");
const style = require("../app/episode-style.js");
const editor = require("../app/canvas-editor.js");
const library = require("../app/show-library.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function completeDraft(name) {
  const draft = setup.createDraft();
  draft.episodeName = name || "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
  ];
  return draft;
}

test("validateShowName requires a unique non-empty name", () => {
  library._resetCounters();
  let lib = library.createLibrary();
  lib = library.saveShow(lib, library.createShow("Founders Unfiltered"));
  assert.strictEqual(library.validateShowName(lib, "").ok, false);
  assert.strictEqual(library.validateShowName(lib, "Founders Unfiltered").ok, false);
  assert.strictEqual(library.validateShowName(lib, "Agency Weekly").ok, true);
});

test("listShows returns shows sorted by name with episode counts", () => {
  library._resetCounters();
  let lib = library.createLibrary();
  lib = library.saveShow(lib, library.createShow("Zeta Podcast"));
  lib = library.saveShow(lib, library.createShow("Alpha Podcast"));
  lib = library.saveEpisode(lib, library.createEpisode("show-1", "Pilot", { id: "ep-1" }));

  const list = library.listShows(lib);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].name, "Alpha Podcast");
});

test("startEpisodeForShow creates a draft episode linked to the show", () => {
  library._resetCounters();
  let lib = library.createLibrary();
  const show = library.createShow("Founders Unfiltered", { templateId: "tpl-1" });
  lib = library.saveShow(lib, show);

  const started = library.startEpisodeForShow(lib, show.id, "Episode 8");
  assert.strictEqual(started.ok, true);
  assert.strictEqual(started.templateId, "tpl-1");
  assert.strictEqual(started.episode.status, "draft");
  assert.strictEqual(started.episode.episodeName, "Episode 8");
});

test("deriveEpisodeStatus maps workspace progress to clear statuses", () => {
  assert.strictEqual(library.deriveEpisodeStatus({}), "draft");
  assert.strictEqual(library.deriveEpisodeStatus({ hasStyle: true }), "in_production");
  assert.strictEqual(library.deriveEpisodeStatus({ exportStatus: "ready" }), "exported");
});

test("syncEpisodeProgress updates episode name, status, and export file", () => {
  library._resetCounters();
  let lib = library.createLibrary();
  const show = library.createShow("Agency Weekly");
  lib = library.saveShow(lib, show);
  const episode = library.createEpisode(show.id, "Episode 1", { id: "ep-1" });
  lib = library.saveEpisode(lib, episode);

  lib = library.syncEpisodeProgress(lib, "ep-1", "Agency Weekly #12", {
    hasStyle: true,
    hasAudio: true,
    exportStatus: "ready",
    exportDownloadName: "Agency-Weekly-12-1080p.mp4",
  });

  const updated = library.getEpisode(lib, "ep-1");
  assert.strictEqual(updated.episodeName, "Agency Weekly #12");
  assert.strictEqual(updated.status, "exported");
  assert.strictEqual(updated.statusLabel, "Exported");
  assert.strictEqual(updated.exportFileName, "Agency-Weekly-12-1080p.mp4");
});

test("deserializeLibrary hydrates counters before creating more shows and episodes", () => {
  library._resetCounters();
  let lib = library.createLibrary();
  const firstShow = library.createShow("Founders Unfiltered");
  lib = library.saveShow(lib, firstShow);
  lib = library.saveEpisode(lib, library.createEpisode(firstShow.id, "Episode 1"));

  library._resetCounters();
  lib = library.deserializeLibrary(library.serializeLibrary(lib));

  const secondShow = library.createShow("Agency Weekly");
  assert.strictEqual(secondShow.id, "show-2");
  lib = library.saveShow(lib, secondShow);
  assert.strictEqual(library.listShows(lib).length, 2);
  assert.strictEqual(library.getShow(lib, firstShow.id).name, "Founders Unfiltered");

  const started = library.startEpisodeForShow(lib, firstShow.id, "Episode 2");
  assert.strictEqual(started.ok, true);
  assert.strictEqual(started.episode.id, "ep-2");
  assert.strictEqual(library.listEpisodes(started.library, firstShow.id).length, 2);
});

test("summarizeShow surfaces template identity and episode list", () => {
  library._resetCounters();
  let lib = library.createLibrary();
  const show = library.createShow("Founders Unfiltered", { templateId: "tpl-founders" });
  lib = library.saveShow(lib, show);
  lib = library.saveEpisode(lib, library.createEpisode(show.id, "Episode 7", { id: "ep-7", status: "exported" }));

  const summary = library.summarizeShow(lib, show.id, {
    name: "Founders Unfiltered",
    presetName: "Studio Spotlight",
    titleText: "Founders Layout",
  });

  assert.strictEqual(summary.episodeCount, 1);
  assert.strictEqual(summary.exportedCount, 1);
  assert.ok(summary.identityLine.includes("Studio Spotlight"));
  assert.strictEqual(summary.episodes[0].statusLabel, "Exported");
});

test("ACCEPTANCE: create show, start prefilled episode, track status through export", () => {
  library._resetCounters();
  templates._resetTemplateCounter();

  const episodeA = setup.summarize(completeDraft("Founders #7"));
  const selection = style.createSelection();
  selection.presetId = "studio-spotlight";
  let doc = editor.createFromStyle(style.summarizeStyle(selection, episodeA.speakerCount), episodeA, selection);
  doc = editor.updateElement(doc, "titleText", "Founders Show Layout");

  let store = templates.createStore();
  store = templates.saveTemplate(store, templates.createTemplate("Founders Unfiltered", doc, "tpl-founders"));
  const templateMeta = templates.listTemplates(store)[0];

  let lib = library.createLibrary();
  const show = library.createShow("Founders Unfiltered", { templateId: "tpl-founders" });
  lib = library.saveShow(lib, show);
  assert.strictEqual(library.listShows(lib).length, 1);

  const started = library.startEpisodeForShow(lib, show.id, "");
  assert.strictEqual(started.ok, true);
  lib = started.library;

  const draftB = completeDraft("Founders Unfiltered #8");
  const episodeB = setup.summarize(draftB);
  const template = templates.getTemplate(store, "tpl-founders");
  const styleFromTemplate = templates.styleSelectionFromCanvas(template.canvas);
  const canvasForB = templates.applyTemplateForEpisode(template, episodeB, styleFromTemplate);

  assert.strictEqual(canvasForB.titleText, "Founders Show Layout");
  assert.strictEqual(canvasForB.speakerFrames[0].name, "Sam Rivera");

  lib = library.syncEpisodeProgress(lib, started.episode.id, episodeB.episodeName, {
    hasStyle: true,
    hasAudio: true,
    publishReviewApproved: true,
    exportStatus: "ready",
    exportDownloadName: "Founders-Unfiltered-8-1080p.mp4",
  });

  const showSummary = library.summarizeShow(lib, show.id, templateMeta);
  assert.strictEqual(showSummary.episodes.length, 1);
  assert.strictEqual(showSummary.episodes[0].status, "exported");
  assert.ok(showSummary.identityLine.indexOf("Founders Unfiltered") >= 0);
});

console.log(`\nshow library: ${passed} assertions passed`);

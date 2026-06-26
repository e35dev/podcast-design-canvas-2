"use strict";

// Show-scoped library grouping for episodes and templates (#166).
// Run with: `node tests/show-scoped-library.test.js`.

const assert = require("assert");
const library = require("../app/show-library.js");
const templates = require("../app/show-templates.js");
const identity = require("../app/show-identity.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function minimalCanvas(title) {
  return {
    presetId: "clean-studio",
    presetName: "Clean Studio",
    layoutId: "grid",
    pacingId: "balanced",
    background: "#10131f",
    accent: "#6c4cff",
    titleText: title || "Sample layout",
    layers: [],
    speakerFrames: [],
  };
}

function simulateReload() {
  library._resetCounters();
  templates._resetTemplateCounter();
}

test("listTemplatesForShow keeps templates grouped under each show", () => {
  simulateReload();
  let lib = library.createLibrary();
  const showA = library.createShow("Founders Unfiltered");
  const showB = library.createShow("Weeknight Live");
  lib = library.addShow(lib, showA);
  lib = library.addShow(lib, showB);

  let store = templates.createStore();
  store = templates.saveTemplate(store, templates.createTemplate("Founders Look", minimalCanvas("Founders"), undefined, showA.id));
  store = templates.saveTemplate(store, templates.createTemplate("Weeknight Look", minimalCanvas("Weeknight"), undefined, showB.id));

  const foundersTemplates = templates.listTemplatesForShow(store, showA.id);
  const weeknightTemplates = templates.listTemplatesForShow(store, showB.id);
  assert.strictEqual(foundersTemplates.length, 1);
  assert.strictEqual(weeknightTemplates.length, 1);
  assert.strictEqual(foundersTemplates[0].name, "Founders Look");
  assert.strictEqual(weeknightTemplates[0].name, "Weeknight Look");
  assert.strictEqual(foundersTemplates[0].showId, showA.id);
  assert.strictEqual(weeknightTemplates[0].showId, showB.id);
  assert.strictEqual(templates.listTemplatesForShow(store, showA.id).find((item) => item.name === "Weeknight Look"), undefined);
});

test("legacy templates without showId stay out of scoped show lists", () => {
  simulateReload();
  let lib = library.createLibrary();
  const show = library.createShow("Creator Show");
  lib = library.addShow(lib, show);

  let store = templates.createStore();
  store = templates.saveTemplate(store, templates.createTemplate("Legacy Layout", minimalCanvas("Legacy"), undefined, ""));
  store = templates.saveTemplate(store, templates.createTemplate("Scoped Layout", minimalCanvas("Scoped"), undefined, show.id));

  assert.strictEqual(templates.listTemplatesForShow(store, show.id).length, 1);
  assert.strictEqual(templates.listTemplatesForShow(store, show.id)[0].name, "Scoped Layout");
  assert.strictEqual(templates.listTemplates(store).length, 2);
  assert.strictEqual(templates.listTemplatesForShow(store, null).length, 0);
});

test("reconcileTemplateShowIds links legacy templates to owning shows", () => {
  simulateReload();
  let lib = library.createLibrary();
  const show = library.createShow("Founders Unfiltered", { templateId: "tpl-legacy" });
  lib = library.addShow(lib, show);

  let store = templates.createStore();
  store = templates.saveTemplate(store, templates.createTemplate("Founders Format", minimalCanvas("Founders"), "tpl-legacy", ""));

  store = templates.reconcileTemplateShowIds(store, lib);
  assert.strictEqual(templates.listTemplatesForShow(store, show.id).length, 1);
  assert.strictEqual(templates.getTemplate(store, "tpl-legacy").showId, show.id);
});

test("templates saved with a showId appear only in that show list", () => {
  simulateReload();
  let lib = library.createLibrary();
  const showA = library.createShow("Show A");
  const showB = library.createShow("Show B");
  lib = library.addShow(lib, showA);
  lib = library.addShow(lib, showB);

  let store = templates.createStore();
  store = templates.saveTemplate(store, templates.createTemplate("Show A Look", minimalCanvas("A"), undefined, showA.id));

  assert.strictEqual(templates.listTemplatesForShow(store, showA.id).length, 1);
  assert.strictEqual(templates.listTemplatesForShow(store, showB.id).length, 0);
});

test("serialize and deserialize preserve show-scoped template grouping", () => {
  simulateReload();
  let lib = library.createLibrary();
  const show = library.createShow("Creator Show");
  lib = library.addShow(lib, show);
  const ep = library.createEpisode(show.id, "Pilot");
  lib = library.addEpisode(lib, show.id, ep);

  let store = templates.createStore();
  store = templates.saveTemplate(store, templates.createTemplate("Saved Look", minimalCanvas("Saved"), undefined, show.id));

  simulateReload();
  lib = library.deserializeLibrary(library.serializeLibrary(lib));
  store = templates.deserializeStore(templates.serializeStore(store));

  const scoped = templates.listTemplatesForShow(store, show.id);
  assert.strictEqual(scoped.length, 1);
  assert.strictEqual(scoped[0].showId, show.id);
  assert.strictEqual(library.listEpisodes(lib, show.id).length, 1);
});

test("ACCEPTANCE: new episodes and templates stay under the same show after reload", () => {
  simulateReload();

  let lib = library.createLibrary();
  const showA = library.createShow("Founders Unfiltered");
  const showB = library.createShow("Weeknight Live");
  lib = library.addShow(lib, showA);
  lib = library.addShow(lib, showB);

  lib = library.addEpisode(lib, showA.id, library.createEpisode(showA.id, "Episode 1"));
  lib = library.addEpisode(lib, showB.id, library.createEpisode(showB.id, "Pilot"));

  let store = templates.createStore();
  store = templates.saveTemplate(store, templates.createTemplate("Founders Format", minimalCanvas("Founders"), undefined, showA.id));
  store = templates.saveTemplate(store, templates.createTemplate("Weeknight Format", minimalCanvas("Weeknight"), undefined, showB.id));

  simulateReload();
  lib = library.deserializeLibrary(library.serializeLibrary(lib));
  store = templates.deserializeStore(templates.serializeStore(store));

  const nextEpisode = library.createEpisode(showA.id, "Episode 2");
  lib = library.addEpisode(lib, showA.id, nextEpisode);
  const nextTemplate = templates.createTemplate("Founders Update", minimalCanvas("Update"), undefined, showA.id);
  store = templates.saveTemplate(store, nextTemplate);

  assert.strictEqual(nextEpisode.showId, showA.id);
  assert.strictEqual(nextTemplate.showId, showA.id);
  assert.strictEqual(library.listEpisodes(lib, showA.id).length, 2);
  assert.strictEqual(library.listEpisodes(lib, showB.id).length, 1);
  assert.strictEqual(templates.listTemplatesForShow(store, showA.id).length, 2);
  assert.strictEqual(templates.listTemplatesForShow(store, showB.id).length, 1);

  const start = identity.buildEpisodeStart(library.getShow(lib, showA.id), store);
  assert.strictEqual(start.showId, showA.id);
  assert.ok(start.setupDraft.episodeName.includes("Founders Unfiltered"));
});

console.log(`\nshow scoped library: ${passed} test(s) passed.`);

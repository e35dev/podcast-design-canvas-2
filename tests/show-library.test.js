"use strict";

// Show library test suite for Podcast Design Canvas (#47).
// Guards creating shows, managing episodes with statuses, prefilling from
// show defaults, and template/speaker identity persistence.
// Run with: `node tests/show-library.test.js`.

var assert = require("assert");
var SL = require("../app/show-library.js");
var TM = require("../app/show-templates.js");

var passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log("  ok " + name);
}

// Reset counters between tests for deterministic IDs.
SL._resetCounters();
TM._resetTemplateCounter();

// ---- Show CRUD ----

test("createLibrary returns empty library", function () {
  var lib = SL.createLibrary();
  assert.deepStrictEqual(lib.shows, []);
  assert.strictEqual(lib.activeShowId, null);
});

test("createShow generates a show with a unique id", function () {
  SL._resetCounters();
  var show = SL.createShow("Founders Unfiltered");
  assert.strictEqual(show.name, "Founders Unfiltered");
  assert.strictEqual(show.id, "show-1");
  assert.deepStrictEqual(show.episodes, []);
  assert.strictEqual(show.templateId, null);
});

test("validateShowName rejects empty names", function () {
  var lib = SL.createLibrary();
  var result = SL.validateShowName(lib, "  ");
  assert.strictEqual(result.ok, false);
  assert.ok(result.error);
});

test("validateShowName rejects duplicate names", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  lib = SL.saveShow(lib, SL.createShow("My Show"));
  var result = SL.validateShowName(lib, "my show");
  assert.strictEqual(result.ok, false);
});

test("validateShowName allows same name when updating existing show", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  var show = SL.createShow("My Show");
  lib = SL.saveShow(lib, show);
  var result = SL.validateShowName(lib, "My Show", show.id);
  assert.strictEqual(result.ok, true);
});

test("saveShow adds and sorts shows alphabetically", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  lib = SL.saveShow(lib, SL.createShow("Zed Talk"));
  lib = SL.saveShow(lib, SL.createShow("Alpha Pod"));
  var list = SL.listShows(lib);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].name, "Alpha Pod");
  assert.strictEqual(list[1].name, "Zed Talk");
});

test("saveShow updates an existing show by id", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  var show = SL.createShow("Original");
  lib = SL.saveShow(lib, show);
  show.name = "Updated";
  lib = SL.saveShow(lib, show);
  var list = SL.listShows(lib);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, "Updated");
});

test("getShow returns the show or null", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  var show = SL.createShow("Test Show");
  lib = SL.saveShow(lib, show);
  assert.strictEqual(SL.getShow(lib, show.id).name, "Test Show");
  assert.strictEqual(SL.getShow(lib, "nonexistent"), null);
});

// ---- Episodes ----

test("createEpisode returns a draft episode", function () {
  SL._resetCounters();
  var ep = SL.createEpisode("Episode 1");
  assert.strictEqual(ep.name, "Episode 1");
  assert.strictEqual(ep.status, "draft");
  assert.ok(ep.id);
});

test("addEpisode adds an episode to a show", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  var show = SL.createShow("Pod");
  lib = SL.saveShow(lib, show);
  var ep = SL.createEpisode("Ep 1");
  lib = SL.addEpisode(lib, show.id, ep);
  var episodes = SL.listEpisodes(lib, show.id);
  assert.strictEqual(episodes.length, 1);
  assert.strictEqual(episodes[0].name, "Ep 1");
  assert.strictEqual(episodes[0].statusLabel, "Draft");
});

test("updateEpisodeStatus changes episode status", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  var show = SL.createShow("Pod");
  lib = SL.saveShow(lib, show);
  var ep = SL.createEpisode("Ep 1");
  lib = SL.addEpisode(lib, show.id, ep);
  lib = SL.updateEpisodeStatus(lib, show.id, ep.id, "in-progress");
  var episodes = SL.listEpisodes(lib, show.id);
  assert.strictEqual(episodes[0].status, "in-progress");
  assert.strictEqual(episodes[0].statusLabel, "In progress");
});

test("updateEpisodeStatus ignores invalid status", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  var show = SL.createShow("Pod");
  lib = SL.saveShow(lib, show);
  var ep = SL.createEpisode("Ep 1");
  lib = SL.addEpisode(lib, show.id, ep);
  lib = SL.updateEpisodeStatus(lib, show.id, ep.id, "bogus");
  var episodes = SL.listEpisodes(lib, show.id);
  assert.strictEqual(episodes[0].status, "draft");
});

test("listEpisodes returns empty for unknown show", function () {
  var lib = SL.createLibrary();
  assert.deepStrictEqual(SL.listEpisodes(lib, "nope"), []);
});

// ---- Template + speaker identity ----

test("showSummary includes template name and speaker count", function () {
  SL._resetCounters();
  TM._resetTemplateCounter();
  var lib = SL.createLibrary();
  var show = SL.createShow("My Pod", {
    templateId: "tpl-1",
    speakerDefaults: [{ name: "Alice", role: "Host" }, { name: "Bob", role: "Guest 1" }],
  });
  lib = SL.saveShow(lib, show);

  var store = TM.createStore();
  store = TM.saveTemplate(store, TM.createTemplate("Clean Modern", { titleText: "T" }, "tpl-1"));

  var summary = SL.showSummary(lib, show.id, store);
  assert.strictEqual(summary.name, "My Pod");
  assert.strictEqual(summary.templateName, "Clean Modern");
  assert.ok(summary.identityLine.indexOf("Clean Modern") >= 0);
  assert.ok(summary.identityLine.indexOf("2 default speakers") >= 0);
});

test("showSummary without template shows fallback message", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  var show = SL.createShow("Bare Pod");
  lib = SL.saveShow(lib, show);
  var summary = SL.showSummary(lib, show.id, null);
  assert.ok(summary.identityLine.indexOf("No template") >= 0);
});

test("updateShowTemplate assigns a template to a show", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  var show = SL.createShow("Pod");
  lib = SL.saveShow(lib, show);
  lib = SL.updateShowTemplate(lib, show.id, "tpl-x");
  assert.strictEqual(SL.getShow(lib, show.id).templateId, "tpl-x");
});

test("updateShowSpeakerDefaults sets default speakers", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  var show = SL.createShow("Pod");
  lib = SL.saveShow(lib, show);
  lib = SL.updateShowSpeakerDefaults(lib, show.id, [
    { name: "Sam", role: "Host" },
    { name: "Dana", role: "Guest 1" },
  ]);
  var stored = SL.getShow(lib, show.id);
  assert.strictEqual(stored.speakerDefaults.length, 2);
  assert.strictEqual(stored.speakerDefaults[0].name, "Sam");
});

// ---- Prefill ----

test("prefillDraftFromShow returns speaker defaults and template id", function () {
  SL._resetCounters();
  var show = SL.createShow("Pod", {
    templateId: "tpl-7",
    speakerDefaults: [{ name: "Alice", role: "Host" }],
  });
  var prefill = SL.prefillDraftFromShow(show);
  assert.strictEqual(prefill.templateId, "tpl-7");
  assert.strictEqual(prefill.speakerDefaults.length, 1);
  assert.strictEqual(prefill.speakerDefaults[0].name, "Alice");
});

test("prefillDraftFromShow returns null for null show", function () {
  assert.strictEqual(SL.prefillDraftFromShow(null), null);
});

// ---- Active show ----

test("setActiveShow tracks which show is selected", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  var show = SL.createShow("Pod");
  lib = SL.saveShow(lib, show);
  lib = SL.setActiveShow(lib, show.id);
  assert.strictEqual(lib.activeShowId, show.id);
});

// ---- Persistence ----

test("serialize/deserialize round-trips the library", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  lib = SL.saveShow(lib, SL.createShow("Show A"));
  lib = SL.saveShow(lib, SL.createShow("Show B"));
  lib = SL.addEpisode(lib, lib.shows[0].id, SL.createEpisode("Ep 1"));
  lib = SL.setActiveShow(lib, lib.shows[1].id);

  var json = SL.serializeLibrary(lib);
  var restored = SL.deserializeLibrary(json);
  assert.strictEqual(restored.shows.length, 2);
  assert.strictEqual(restored.activeShowId, lib.shows[1].id);
  assert.strictEqual(restored.shows[0].episodes.length, 1);
});

test("deserializeLibrary handles invalid JSON gracefully", function () {
  var lib = SL.deserializeLibrary("not json");
  assert.deepStrictEqual(lib.shows, []);
});

test("deserializeLibrary handles null gracefully", function () {
  var lib = SL.deserializeLibrary(null);
  assert.deepStrictEqual(lib.shows, []);
});

// ---- Episode status counts ----

test("showSummary counts published and in-progress episodes", function () {
  SL._resetCounters();
  var lib = SL.createLibrary();
  var show = SL.createShow("Pod");
  lib = SL.saveShow(lib, show);
  lib = SL.addEpisode(lib, show.id, SL.createEpisode("Ep 1"));
  lib = SL.addEpisode(lib, show.id, SL.createEpisode("Ep 2"));
  lib = SL.addEpisode(lib, show.id, SL.createEpisode("Ep 3"));
  var eps = SL.listEpisodes(lib, show.id);
  lib = SL.updateEpisodeStatus(lib, show.id, eps[0].id, "published");
  lib = SL.updateEpisodeStatus(lib, show.id, eps[1].id, "in-progress");
  var summary = SL.showSummary(lib, show.id, null);
  assert.strictEqual(summary.episodeCount, 3);
  assert.strictEqual(summary.publishedCount, 1);
  assert.strictEqual(summary.inProgressCount, 1);
});

// ---- ACCEPTANCE: end-to-end walkthrough ----

test("ACCEPTANCE: create show, add episodes, assign template, prefill new episode", function () {
  SL._resetCounters();
  TM._resetTemplateCounter();

  // 1. Create a library and add a show
  var lib = SL.createLibrary();
  var nameResult = SL.validateShowName(lib, "Founders Unfiltered");
  assert.strictEqual(nameResult.ok, true);
  var show = SL.createShow(nameResult.name, {
    speakerDefaults: [
      { name: "Sam Rivera", role: "Host" },
      { name: "Dana Kim", role: "Guest 1" },
    ],
  });
  lib = SL.saveShow(lib, show);

  // 2. Assign a template
  var tplStore = TM.createStore();
  tplStore = TM.saveTemplate(tplStore, TM.createTemplate("Clean Modern", { titleText: "FU" }, "tpl-clean"));
  lib = SL.updateShowTemplate(lib, show.id, "tpl-clean");

  // 3. See template/style identity
  var summary = SL.showSummary(lib, show.id, tplStore);
  assert.strictEqual(summary.templateName, "Clean Modern");
  assert.ok(summary.identityLine.indexOf("Clean Modern") >= 0);

  // 4. Add episodes with statuses
  lib = SL.addEpisode(lib, show.id, SL.createEpisode("Episode 1"));
  lib = SL.addEpisode(lib, show.id, SL.createEpisode("Episode 2"));
  var episodes = SL.listEpisodes(lib, show.id);
  assert.strictEqual(episodes.length, 2);
  assert.strictEqual(episodes[0].statusLabel, "Draft");

  lib = SL.updateEpisodeStatus(lib, show.id, episodes[0].id, "published");
  episodes = SL.listEpisodes(lib, show.id);
  assert.strictEqual(episodes[0].statusLabel, "Published");

  // 5. Start a new episode prefilled with show defaults
  var prefill = SL.prefillDraftFromShow(SL.getShow(lib, show.id));
  assert.strictEqual(prefill.templateId, "tpl-clean");
  assert.strictEqual(prefill.speakerDefaults.length, 2);
  assert.strictEqual(prefill.speakerDefaults[0].name, "Sam Rivera");

  // 6. Persists across reload
  var json = SL.serializeLibrary(lib);
  var restored = SL.deserializeLibrary(json);
  assert.strictEqual(restored.shows.length, 1);
  assert.strictEqual(SL.listEpisodes(restored, show.id).length, 2);

  // 7. Select the show
  lib = SL.setActiveShow(lib, show.id);
  assert.strictEqual(lib.activeShowId, show.id);
});

console.log("\n  " + passed + " show-library assertions passed");

"use strict";

// Show library dashboard smoke suite for Podcast Design Canvas (#47 — template-system).
// Guards the documented acceptance: create/select shows, see each show's saved
// template/style identity, list episodes with clear statuses, and start a new episode
// prefilled with the show's template and speaker/style defaults.
//
// The headline guard is multi-show persistence: creating a show AFTER the library has been
// serialized and rehydrated (a page reload) must never reuse an id and overwrite an existing
// show. That was the blocker on the prior attempt, so it is tested explicitly.
// Run with: `node tests/show-library.test.js`.

const assert = require("assert");
const lib = require("../app/show-library.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

test("offers clear, creator-facing episode statuses", () => {
  assert.ok(lib.EPISODE_STATUSES.length >= 3);
  const keys = lib.EPISODE_STATUSES.map((s) => s.key);
  ["draft", "published"].forEach((key) => assert.ok(keys.includes(key)));
  lib.EPISODE_STATUSES.forEach((s) => assert.ok(s.label, `${s.key} has a label`));
});

test("a fresh library has no shows", () => {
  assert.deepStrictEqual(lib.createLibrary(), { shows: [] });
});

test("a show name must be present and unique", () => {
  let library = lib.createLibrary();
  assert.strictEqual(lib.validateShowName(library, "   ").ok, false);
  library = lib.saveShow(library, lib.createShow(library, "Founders Unfiltered"));
  const dup = lib.validateShowName(library, "founders unfiltered");
  assert.strictEqual(dup.ok, false);
  assert.ok(/already exists/i.test(dup.error));
  assert.strictEqual(lib.validateShowName(library, "A New Show").ok, true);
});

test("createShow carries the show's template/style identity", () => {
  const library = lib.createLibrary();
  const show = lib.createShow(library, "Design Notes", {
    templateId: "tpl-2",
    presetName: "Bold Broadcast",
    accent: "#ff5d8f",
    styleSelection: { presetId: "bold-broadcast", layout: "spotlight", pacing: "punchy" },
    speakerDefaults: [{ role: "Host", name: "Sam Rivera" }, { role: "Guest 1", name: "" }],
  });
  assert.strictEqual(show.templateId, "tpl-2");
  assert.strictEqual(show.presetName, "Bold Broadcast");
  assert.deepStrictEqual(show.styleSelection, { presetId: "bold-broadcast", layout: "spotlight", pacing: "punchy" });
  // Empty-name speaker rows are kept only when they carry a role (recurring cast slot).
  assert.strictEqual(show.speakerDefaults.length, 2);
});

test("shows are saved, listed alphabetically, and separated", () => {
  let library = lib.createLibrary();
  library = lib.saveShow(library, lib.createShow(library, "Zeta Show"));
  library = lib.saveShow(library, lib.createShow(library, "Alpha Show"));
  const rows = lib.listShows(library);
  assert.deepStrictEqual(rows.map((r) => r.name), ["Alpha Show", "Zeta Show"]);
  assert.strictEqual(new Set(rows.map((r) => r.id)).size, 2, "ids are distinct");
});

test("episodes are added with clear statuses and counted per show", () => {
  let library = lib.createLibrary();
  const show = lib.createShow(library, "Founders Unfiltered");
  library = lib.saveShow(library, show);
  library = lib.addEpisode(library, show.id, lib.createEpisode(show, "Episode 1", { status: "published" }));
  const reread = lib.getShow(library, show.id);
  library = lib.addEpisode(library, show.id, lib.createEpisode(reread, "Episode 2", { status: "draft" }));

  const row = lib.listShows(library)[0];
  assert.strictEqual(row.episodeCount, 2);
  assert.strictEqual(row.publishedCount, 1);
  assert.strictEqual(row.statusCounts.draft, 1);
});

test("updateEpisodeStatus moves an episode to a new clear status", () => {
  let library = lib.createLibrary();
  const show = lib.createShow(library, "Show");
  library = lib.saveShow(library, show);
  const ep = lib.createEpisode(show, "Ep", { status: "draft" });
  library = lib.addEpisode(library, show.id, ep);
  library = lib.updateEpisodeStatus(library, show.id, ep.id, "published");
  assert.strictEqual(lib.getShow(library, show.id).episodes[0].status, "published");
});

test("startEpisodeFromShow prefills template, style, and speaker defaults", () => {
  const library = lib.createLibrary();
  const show = lib.createShow(library, "Founders Unfiltered", {
    templateId: "tpl-1",
    styleSelection: { presetId: "split-stage", layout: "split", pacing: "balanced" },
    speakerDefaults: [{ role: "Host", name: "Sam Rivera" }, { role: "Guest 1", name: "Dana Kim" }],
  });
  const prefill = lib.startEpisodeFromShow(show, "Episode 12");
  assert.strictEqual(prefill.showId, show.id);
  assert.strictEqual(prefill.episodeName, "Episode 12");
  assert.strictEqual(prefill.templateId, "tpl-1");
  assert.deepStrictEqual(prefill.styleSelection, { presetId: "split-stage", layout: "split", pacing: "balanced" });
  assert.deepStrictEqual(prefill.speakers.map((s) => s.name), ["Sam Rivera", "Dana Kim"]);
});

test("summarizeLibrary totals shows, episodes, and published episodes", () => {
  let library = lib.createLibrary();
  const a = lib.createShow(library, "A");
  library = lib.saveShow(library, a);
  library = lib.addEpisode(library, a.id, lib.createEpisode(a, "A1", { status: "published" }));
  const b = lib.createShow(library, "B");
  library = lib.saveShow(library, b);
  library = lib.addEpisode(library, b.id, lib.createEpisode(b, "B1", { status: "draft" }));
  const summary = lib.summarizeLibrary(library);
  assert.deepStrictEqual(summary, { showCount: 2, episodeCount: 2, publishedCount: 1 });
});

test("serialize / deserialize round-trips the library", () => {
  let library = lib.createLibrary();
  const show = lib.createShow(library, "Round Trip", { presetName: "Panel Grid" });
  library = lib.saveShow(library, show);
  library = lib.addEpisode(library, show.id, lib.createEpisode(show, "Ep", { status: "ready" }));
  const restored = lib.deserializeLibrary(lib.serializeLibrary(library));
  assert.strictEqual(restored.shows.length, 1);
  assert.strictEqual(restored.shows[0].name, "Round Trip");
  assert.strictEqual(restored.shows[0].episodes[0].status, "ready");
});

test("deserialize tolerates garbage and missing shape", () => {
  assert.deepStrictEqual(lib.deserializeLibrary(""), { shows: [] });
  assert.deepStrictEqual(lib.deserializeLibrary("not json"), { shows: [] });
  assert.deepStrictEqual(lib.deserializeLibrary("{}"), { shows: [] });
});

// THE headline guard: the exact failure that closed the prior attempt. After saving shows,
// reloading the app (a fresh in-memory state restored from storage) and creating ANOTHER
// show must not reuse an id like `show-1` and overwrite an existing show.
test("ACCEPTANCE: creating a show after a reload never collides or overwrites", () => {
  // Session 1: create two shows in a brand-new library.
  let library = lib.createLibrary();
  const a = lib.createShow(library, "Show A");
  library = lib.saveShow(library, a);
  const b = lib.createShow(library, "Show B");
  library = lib.saveShow(library, b);
  assert.notStrictEqual(a.id, b.id, "two shows get distinct ids");

  // Page reload: persist, then rehydrate into a fresh library object. No counter survives.
  const persisted = lib.serializeLibrary(library);
  const reloaded = lib.deserializeLibrary(persisted);
  assert.strictEqual(reloaded.shows.length, 2);

  // Session 2: create a third show from the rehydrated library.
  const c = lib.createShow(reloaded, "Show C");
  const allIds = reloaded.shows.map((s) => s.id).concat(c.id);
  assert.strictEqual(new Set(allIds).size, allIds.length, "the new id does not collide with any existing show");

  const afterSave = lib.saveShow(reloaded, c);
  assert.strictEqual(afterSave.shows.length, 3, "the new show is added, none overwritten");
  ["Show A", "Show B", "Show C"].forEach((name) => {
    assert.ok(afterSave.shows.some((s) => s.name === name), `${name} is still in the library`);
  });

  // Episodes added after a reload are likewise collision-free within their show.
  const withEp = lib.addEpisode(afterSave, a.id, lib.createEpisode(lib.getShow(afterSave, a.id), "A1"));
  const reloadedAgain = lib.deserializeLibrary(lib.serializeLibrary(withEp));
  const showA = lib.getShow(reloadedAgain, a.id);
  const ep2 = lib.createEpisode(showA, "A2");
  assert.notStrictEqual(ep2.id, showA.episodes[0].id, "a second episode after reload gets a fresh id");
});

console.log(`\nshow library: ${passed} assertions passed`);

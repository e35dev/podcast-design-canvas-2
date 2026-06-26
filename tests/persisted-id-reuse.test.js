"use strict";

// Regression: persisted IDs must not be reused after a reload (#163).
// Run with: `node tests/persisted-id-reuse.test.js`.
//
// A browser reload re-executes the modules (counters reset to 0) and then
// rehydrates saved JSON. If deserialize does not restore the counters, the next
// created item reuses an existing id and silently replaces/merges saved data.

const assert = require("assert");
const library = require("../app/show-library.js");
const templates = require("../app/show-templates.js");
const gallery = require("../app/creator-template-gallery.js");

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`  ok ${name}`); }

test("shows and episodes created after reload get unique ids", () => {
  let lib = library.createLibrary();
  const showA = library.createShow("Show A");
  lib = library.addShow(lib, showA);
  const epA = library.createEpisode(showA.id, "Ep A");
  lib = library.addEpisode(lib, showA.id, epA);

  const saved = JSON.stringify(lib); // what localStorage holds
  library._resetCounters();          // simulate the reload re-executing the module
  library.deserializeLibrary(saved); // rehydrate -> must restore counters

  const showB = library.createShow("Show B");
  const epB = library.createEpisode(showA.id, "Ep B");
  assert.notStrictEqual(showB.id, showA.id, "new show reused a saved show id");
  assert.notStrictEqual(epB.id, epA.id, "new episode reused a saved episode id");
});

test("templates created after reload get unique ids", () => {
  let store = templates.createStore();
  const t1 = templates.createTemplate("Layout 1", {});
  store = templates.saveTemplate(store, t1);
  const saved = JSON.stringify(store);
  templates._resetTemplateCounter();
  templates.deserializeStore(saved);
  const t2 = templates.createTemplate("Layout 2", {});
  assert.notStrictEqual(t2.id, t1.id, "new template reused a saved template id");
});

test("gallery listings created after reload get unique ids", () => {
  let g = gallery.createGallery();
  g = gallery.publishListing(g, { canvas: { presetName: "Studio" } }, { name: "Listing 1" });
  const first = gallery.listListings(g)[0];
  const saved = JSON.stringify(g);
  gallery._resetListingCounter();
  gallery.deserializeGallery(saved);
  let g2 = gallery.createGallery();
  const created = gallery.createListing({ name: "Listing 2" }, { presetName: "Studio" });
  assert.notStrictEqual(created.id, first.id, "new listing reused a saved listing id");
});

test("reload does not change or merge the previously saved items", () => {
  let lib = library.createLibrary();
  const a = library.createShow("Keep me");
  lib = library.addShow(lib, a);
  const saved = JSON.stringify(lib);
  library._resetCounters();
  const restored = library.deserializeLibrary(saved);
  assert.strictEqual(restored.shows.length, 1);
  assert.strictEqual(restored.shows[0].id, a.id);
  assert.strictEqual(restored.shows[0].name, "Keep me");
});

console.log(`\npersisted-id-reuse: ${passed} test(s) passed.`);

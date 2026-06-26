"use strict";
// Templates grouped under their show identity (#166 / #54).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const templates = require("../app/show-templates.js");
let passed = 0;
function test(n, fn) { fn(); passed += 1; console.log(`  ok ${n}`); }

test("createTemplate records the owning show id", () => {
  const t = templates.createTemplate("Layout", { presetName: "Studio" }, undefined, "show-3");
  assert.strictEqual(t.showId, "show-3");
  const none = templates.createTemplate("Free layout", {});
  assert.strictEqual(none.showId, null);
});

test("listTemplatesForShow returns only that show's templates", () => {
  let s = templates.createStore();
  s = templates.saveTemplate(s, templates.createTemplate("A", { presetName: "S" }, undefined, "show-1"));
  s = templates.saveTemplate(s, templates.createTemplate("B", { presetName: "S" }, undefined, "show-2"));
  assert.deepStrictEqual(templates.listTemplatesForShow(s, "show-1").map((t) => t.name), ["A"]);
  assert.deepStrictEqual(templates.listTemplatesForShow(s, "show-2").map((t) => t.name), ["B"]);
});

test("reload preserves per-show template grouping", () => {
  let s = templates.createStore();
  s = templates.saveTemplate(s, templates.createTemplate("Keep", { presetName: "S" }, undefined, "show-9"));
  const saved = JSON.stringify(s);
  templates._resetTemplateCounter();
  const restored = templates.deserializeStore(saved);
  assert.strictEqual(templates.listTemplatesForShow(restored, "show-9").length, 1);
  assert.strictEqual(templates.listTemplatesForShow(restored, "show-other").length, 0);
});

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
test("the show detail view renders a per-show saved templates section", () => {
  assert.ok(/show-templates-card/.test(ui));
  assert.ok(/TM\.listTemplatesForShow\(templateStore, showId\)/.test(ui));
});
test("saving a template associates it with the active show", () => {
  assert.ok(/activeShowId \|\| null,\n {6}\);/.test(ui) || /activeShowId \|\| null/.test(ui));
});
console.log(`\ngroup-library-by-show: ${passed} test(s) passed.`);

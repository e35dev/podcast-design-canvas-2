"use strict";

// Canvas editor model smoke suite for Podcast Design Canvas (#11).
// Guards the documented acceptance: open the editor from a style selection, change at
// least one layout element, save a named show template, and retrieve it.
// Run with: `node tests/canvas-editor.test.js`.

const assert = require("assert");
const ce = require("../app/canvas-editor.js");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

test("ELEMENT_TYPES covers the five visible canvas layers", () => {
  const ids = ce.ELEMENT_TYPES.map((t) => t.id);
  assert.ok(ids.includes("speaker-frame"), "speaker-frame present");
  assert.ok(ids.includes("caption-bar"),   "caption-bar present");
  assert.ok(ids.includes("title-text"),    "title-text present");
  assert.ok(ids.includes("background"),    "background present");
  assert.ok(ids.includes("overlay"),       "overlay present");
  ce.ELEMENT_TYPES.forEach((t) => {
    assert.ok(t.label, `${t.id} has a label`);
    assert.ok(Array.isArray(t.props) && t.props.length, `${t.id} declares editable props`);
  });
});

test("createTemplate seeds one element entry for every ELEMENT_TYPE", () => {
  const selection = style.createSelection();
  const tmpl = ce.createTemplate("My Show", selection);
  assert.strictEqual(tmpl.name, "My Show");
  assert.strictEqual(tmpl.presetId, selection.presetId);
  assert.strictEqual(tmpl.elements.length, ce.ELEMENT_TYPES.length);
  tmpl.elements.forEach((el) => {
    assert.deepStrictEqual(el.customizations, {}, `${el.id} starts with empty customisations`);
  });
  assert.strictEqual(tmpl.savedAt, null);
});

test("createTemplate trims the name", () => {
  const tmpl = ce.createTemplate("  Weekend Roundup  ", style.createSelection());
  assert.strictEqual(tmpl.name, "Weekend Roundup");
});

test("createTemplate handles a missing style selection gracefully", () => {
  const tmpl = ce.createTemplate("Untitled", null);
  assert.strictEqual(tmpl.presetId, null);
  assert.strictEqual(tmpl.elements.length, ce.ELEMENT_TYPES.length);
});

test("updateElement merges customisations onto the matching element", () => {
  const tmpl = ce.createTemplate("Demo", style.createSelection());
  const result = ce.updateElement(tmpl, "background", { color: "#1a1a2e" });
  assert.deepStrictEqual(result, { ok: true });
  const bg = tmpl.elements.find((e) => e.id === "background");
  assert.strictEqual(bg.customizations.color, "#1a1a2e");
});

test("updateElement merges incrementally — a second call extends without overwriting", () => {
  const tmpl = ce.createTemplate("Demo", style.createSelection());
  ce.updateElement(tmpl, "speaker-frame", { borderRadius: 8 });
  ce.updateElement(tmpl, "speaker-frame", { borderColor: "#6c4cff" });
  const el = tmpl.elements.find((e) => e.id === "speaker-frame");
  assert.strictEqual(el.customizations.borderRadius, 8);
  assert.strictEqual(el.customizations.borderColor, "#6c4cff");
});

test("updateElement does not affect other elements", () => {
  const tmpl = ce.createTemplate("Demo", style.createSelection());
  ce.updateElement(tmpl, "caption-bar", { fontSize: 16 });
  const other = tmpl.elements.filter((e) => e.id !== "caption-bar");
  other.forEach((e) => {
    assert.deepStrictEqual(e.customizations, {}, `${e.id} should be untouched`);
  });
});

test("updateElement rejects an unknown element id", () => {
  const tmpl = ce.createTemplate("Demo", style.createSelection());
  const result = ce.updateElement(tmpl, "nonexistent-layer", { color: "red" });
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes("nonexistent-layer"));
});

test("validateTemplate passes for a freshly created template with a preset", () => {
  const tmpl = ce.createTemplate("Good Template", style.createSelection());
  assert.deepStrictEqual(ce.validateTemplate(tmpl), { ok: true });
});

test("validateTemplate rejects a missing or blank name", () => {
  const tmpl = ce.createTemplate("", style.createSelection());
  assert.strictEqual(ce.validateTemplate(tmpl).ok, false);
  assert.strictEqual(ce.validateTemplate(null).ok, false);
});

test("validateTemplate rejects a template with no presetId", () => {
  const tmpl = ce.createTemplate("No Style", null);
  const result = ce.validateTemplate(tmpl);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error);
});

test("saveTemplate writes to the store and stamps savedAt", () => {
  const store = Object.create(null);
  const tmpl = ce.createTemplate("Weekend Show", style.createSelection());
  const before = Date.now();
  const result = ce.saveTemplate(store, tmpl);
  const after = Date.now();
  assert.deepStrictEqual(result, { ok: true, name: "Weekend Show" });
  assert.ok(store["Weekend Show"], "entry present in store");
  assert.ok(store["Weekend Show"].savedAt >= before && store["Weekend Show"].savedAt <= after);
});

test("saveTemplate rejects an invalid template and does not write to the store", () => {
  const store = Object.create(null);
  const tmpl = ce.createTemplate("", style.createSelection());
  const result = ce.saveTemplate(store, tmpl);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(Object.keys(store).length, 0);
});

test("saveTemplate deep-copies the template so later mutations do not corrupt the store", () => {
  const store = Object.create(null);
  const tmpl = ce.createTemplate("Immutable", style.createSelection());
  ce.saveTemplate(store, tmpl);
  ce.updateElement(tmpl, "background", { color: "changed-after-save" });
  const saved = store["Immutable"].elements.find((e) => e.id === "background");
  assert.deepStrictEqual(saved.customizations, {}, "stored copy is unaffected");
});

test("listTemplates returns templates sorted most-recently-saved first", () => {
  const store = Object.create(null);
  const t1 = ce.createTemplate("Alpha", style.createSelection());
  const t2 = ce.createTemplate("Beta", style.createSelection());
  ce.saveTemplate(store, t1);
  ce.saveTemplate(store, t2);
  const list = ce.listTemplates(store);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].name, "Beta");
  assert.strictEqual(list[1].name, "Alpha");
});

test("getTemplate returns the saved template by exact name", () => {
  const store = Object.create(null);
  const tmpl = ce.createTemplate("Tech Talk", style.createSelection());
  ce.updateElement(tmpl, "title-text", { content: "Tech Talk S1E1" });
  ce.saveTemplate(store, tmpl);
  const loaded = ce.getTemplate(store, "Tech Talk");
  assert.ok(loaded, "template found");
  assert.strictEqual(loaded.name, "Tech Talk");
  assert.strictEqual(
    loaded.elements.find((e) => e.id === "title-text").customizations.content,
    "Tech Talk S1E1"
  );
});

test("getTemplate returns null for an unknown name", () => {
  const store = Object.create(null);
  assert.strictEqual(ce.getTemplate(store, "Ghost"), null);
  assert.strictEqual(ce.getTemplate(null, "Ghost"), null);
});

// End-to-end: full canvas editor flow driven by a real episode setup and style selection.
test("ACCEPTANCE: open editor from a style, customise elements, save a template, reselect it", () => {
  // --- Episode setup ---
  const draft = setup.createDraft();
  draft.episodeName = "Design Matters #12";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"),    { name: "Ella Voss",  fileName: "ella.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Leo Tanaka", fileName: "leo.mp4" }),
  ];
  assert.strictEqual(setup.validateDraft(draft).ok, true);
  const episode = setup.summarize(draft);

  // --- Style selection ---
  const selection = style.createSelection();
  selection.presetId = "panel-grid";
  assert.deepStrictEqual(style.validateStyleSelection ? style.validateStyleSelection(selection) : { ok: true }, { ok: true });

  // --- Open the canvas editor from the chosen style ---
  const tmpl = ce.createTemplate("Design Matters Layout", selection);
  assert.strictEqual(tmpl.presetId, "panel-grid");
  assert.strictEqual(tmpl.elements.length, ce.ELEMENT_TYPES.length);

  // --- Customise at least one layout element ---
  assert.deepStrictEqual(ce.updateElement(tmpl, "background", { color: "#0d1b2a" }), { ok: true });
  assert.deepStrictEqual(ce.updateElement(tmpl, "speaker-frame", { borderRadius: 12, borderColor: "#4dd0e1" }), { ok: true });
  assert.deepStrictEqual(ce.updateElement(tmpl, "title-text", { content: episode.episodeName, fontSize: 24, color: "#eaf6fb" }), { ok: true });

  // --- Save the template ---
  const store = Object.create(null);
  const saved = ce.saveTemplate(store, tmpl);
  assert.deepStrictEqual(saved, { ok: true, name: "Design Matters Layout" });

  // --- Reselect the saved template ---
  const loaded = ce.getTemplate(store, "Design Matters Layout");
  assert.ok(loaded, "template retrieved from store");
  assert.strictEqual(loaded.name, "Design Matters Layout");
  assert.strictEqual(loaded.presetId, "panel-grid");

  const bgEl = loaded.elements.find((e) => e.id === "background");
  assert.strictEqual(bgEl.customizations.color, "#0d1b2a", "background customisation persisted");

  const titleEl = loaded.elements.find((e) => e.id === "title-text");
  assert.strictEqual(titleEl.customizations.content, "Design Matters #12", "title reflects episode name");

  // --- Template is listed for future episodes ---
  const list = ce.listTemplates(store);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, "Design Matters Layout");
});

console.log(`\ncanvas editor: ${passed} assertions passed`);

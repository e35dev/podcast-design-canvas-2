"use strict";

// Gallery template publish smoke suite for Podcast Design Canvas (#159).
// Run with: `node tests/gallery-template-publish.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const editor = require("../app/canvas-editor.js");
const layers = require("../app/canvas-layers.js");
const templates = require("../app/show-templates.js");
const gallery = require("../app/creator-template-gallery.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

function agencySplitTemplate() {
  templates._resetTemplateCounter();
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
  ];
  const episodeA = setup.summarize(draft);
  const selection = style.createSelection();
  selection.presetId = "split-stage";
  selection.layout = "split";
  const applied = style.summarizeStyle(selection, episodeA.speakerCount);
  let doc = editor.createFromStyle(applied, episodeA, selection);
  doc = editor.updateElement(doc, "titleText", "Agency Split Layout");
  const captionsIdx = doc.layers.findIndex((layer) => layer.type === "captions");
  doc = editor.updateLayers(doc, layers.moveLayer(doc.layers, captionsIdx, -1));
  return templates.createTemplate("Agency Split", doc, "tpl-agency-split");
}

test("publishListing stores free or paid access labels", () => {
  gallery._resetListingCounter();
  const template = agencySplitTemplate();
  let store = gallery.createGallery();
  store = gallery.publishListing(store, template, {
    name: "Paid Split Look",
    description: "Premium split-stage layout for client shows.",
    accessLabel: "paid",
  });
  const listing = gallery.getListing(store, gallery.listListings(store)[0].id);
  assert.strictEqual(listing.accessLabel, "paid");
  assert.strictEqual(gallery.formatAccessLabel(listing.accessLabel), "Paid");
  assert.strictEqual(gallery.normalizeAccessLabel("FREE"), "free");
});

test("UI exposes publish access label and start-new-episode gallery handoff", () => {
  assert.ok(ui.includes("gallery-listing-access"));
  assert.ok(ui.includes("Share to gallery →"));
  assert.ok(ui.includes("startEpisodeFromGalleryListing"));
  assert.ok(ui.includes("Start new episode with this layout →"));
  assert.ok(ui.includes("gallery-layout-applied-banner"));
  assert.ok(styles.includes("Gallery template publish (#159)"));
  assert.ok(styles.includes(".creator-gallery-access-paid"));
});

test("ACCEPTANCE: publish saved template, browse listing, and carry layout into a new episode", () => {
  gallery._resetListingCounter();
  templates._resetTemplateCounter();
  const template = agencySplitTemplate();
  let templateStore = templates.createStore();
  templateStore = templates.saveTemplate(templateStore, template);

  let galleryStore = gallery.createGallery();
  galleryStore = gallery.publishListing(galleryStore, template, {
    name: "Creator Split Stage",
    description: "Shareable split-stage layout with captions and brand styling.",
    styleTags: ["Interview", "Split stage"],
    accessLabel: "free",
    creatorName: "Founders Unfiltered",
  });

  const browse = gallery.listListings(galleryStore);
  assert.strictEqual(browse.length, 1);
  assert.strictEqual(browse[0].accessLabel, "free");
  assert.ok(browse[0].description.includes("Shareable"));
  assert.ok(browse[0].previewImage.presetName);

  const picked = gallery.getListing(galleryStore, browse[0].id);
  const freshDraft = setup.createDraft();
  const episodeSummary = setup.summarize(freshDraft);
  const styleFromListing = gallery.styleSelectionFromListing(picked);
  const appliedCanvas = gallery.applyListingForEpisode(picked, episodeSummary, styleFromListing);
  const appliedStyle = style.summarizeStyle(styleFromListing, episodeSummary.speakerCount);

  assert.strictEqual(appliedStyle.presetName, "Split Stage");
  assert.strictEqual(appliedCanvas.titleText, "Agency Split Layout");
  assert.ok(appliedCanvas.layers.some((layer) => layer.type === "captions"));
});

console.log(`\ngallery template publish: ${passed} assertions passed`);

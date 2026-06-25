"use strict";

// Home screen polish smoke suite for Podcast Design Canvas (#112).
//
// Covers the DOM-free home plan (one unmistakable primary action, visually
// quieter secondary actions, polished gallery preview tiles) plus the UI
// wiring in renderShowLibrary() and the CSS classes for the new layout.
// Run with: `node tests/home-screen.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const library = require("../app/show-library.js");
const gallery = require("../app/creator-template-gallery.js");
const home = require("../app/home-screen.js");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const editor = require("../app/canvas-editor.js");
const layers = require("../app/canvas-layers.js");
const templates = require("../app/show-templates.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const homeModule = fs.readFileSync(path.join(__dirname, "../app/home-screen.js"), "utf8");

// ---- helpers ---------------------------------------------------------------

let listingSeq = 0;
function seedListing(name, accent, background, layoutId) {
  templates._resetTemplateCounter();
  listingSeq += 1;
  const draft = setup.createDraft();
  draft.episodeName = "Sample Episode";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
  ];
  const episode = setup.summarize(draft);
  const selection = style.createSelection();
  selection.presetId = "split-stage";
  selection.layout = layoutId || "split";
  const applied = style.summarizeStyle(selection, episode.speakerCount);
  let doc = editor.createFromStyle(applied, episode, selection);
  doc = editor.updateElement(doc, "titleText", name);
  const captionsIdx = doc.layers.findIndex((layer) => layer.type === "captions");
  doc = editor.updateLayers(doc, layers.moveLayer(doc.layers, captionsIdx, -1));
  const tplId = `tpl-${listingSeq}`;
  const tpl = templates.createTemplate(name, doc, tplId);
  let store = gallery.createGallery();
  const listing = gallery.createListing({
    name: name,
    description: `${name} reusable layout.`,
    styleTags: gallery.deriveStyleTags(tpl.canvas).concat(["creator-share"]),
    creatorName: "Founders Unfiltered",
    sourceTemplateId: tplId,
  }, tpl.canvas, `gal-${listingSeq}`);
  // Force previewImage colours so we can assert they flow through.
  listing.previewImage = Object.assign({}, listing.previewImage, {
    accent: accent,
    background: background,
    presetName: listing.previewImage.presetName || "Split Stage",
  });
  store = gallery.saveListing(store, listing);
  return store;
}

function getFullListing(store, id) {
  return gallery.getListing(store, id);
}

// ---- home-plan: empty library ---------------------------------------------

test("buildHomePlan returns a Create-show primary when the library is empty", () => {
  library._resetCounters();
  const lib = library.createLibrary();
  const plan = home.buildHomePlan({
    libraryApi: library,
    galleryApi: gallery,
    library: lib,
    gallery: { listings: [] },
  });
  assert.strictEqual(plan.primary.actionId, "create-show");
  assert.ok(/Create a new show/i.test(plan.primary.label));
  assert.strictEqual(plan.hasDraft, false);
  assert.strictEqual(plan.showCount, 0);
  assert.ok(plan.secondary.length >= 5, "explore row still lists every alternate entry point");
  const ids = plan.secondary.map((entry) => entry.actionId);
  assert.ok(ids.includes("open-style-demo"));
  assert.ok(ids.includes("open-gallery-demo"));
  assert.ok(ids.includes("open-gallery-browse"));
  assert.ok(ids.includes("open-publish-demo"));
  assert.ok(ids.includes("start-blank-episode"));
});

test("PRIMARY_DEFAULT advertises one unmistakable Start here CTA", () => {
  assert.strictEqual(home.PRIMARY_DEFAULT.badge, "Start here");
  assert.ok(/Create a new show/i.test(home.PRIMARY_DEFAULT.label));
});

// ---- home-plan: resume when a draft exists --------------------------------

test("buildHomePlan switches the primary to Resume when a draft episode exists", () => {
  library._resetCounters();
  let lib = library.createLibrary();
  const show = library.createShow("Founders Unfiltered");
  lib = library.addShow(lib, show);
  const draft = library.createEpisode(show.id, "Founders — Episode 1", { status: library.EPISODE_STATUS.DRAFT });
  lib = library.addEpisode(lib, show.id, draft);
  const plan = home.buildHomePlan({
    libraryApi: library,
    galleryApi: gallery,
    library: lib,
    gallery: { listings: [] },
  });
  assert.strictEqual(plan.primary.actionId, "resume-latest");
  assert.strictEqual(plan.primary.showId, show.id);
  assert.strictEqual(plan.primary.episodeId, draft.id);
  assert.ok(/Founders — Episode 1/.test(plan.primary.label));
  assert.strictEqual(plan.hasDraft, true);
});

test("resolvePrimary keeps Create-show when shows exist but no draft is resumable", () => {
  library._resetCounters();
  let lib = library.createLibrary();
  const show = library.createShow("Founders Unfiltered");
  lib = library.addShow(lib, show);
  const ep = library.createEpisode(show.id, "Pilot", { status: library.EPISODE_STATUS.EXPORTED });
  lib = library.addEpisode(lib, show.id, ep);
  const plan = home.buildHomePlan({
    libraryApi: library,
    galleryApi: gallery,
    library: lib,
    gallery: { listings: [] },
  });
  assert.strictEqual(plan.primary.actionId, "create-show");
  assert.strictEqual(plan.hasDraft, false);
});

// ---- home-plan: gallery previews ------------------------------------------

test("buildGalleryPlan returns up to three polished preview tiles with metadata", () => {
  const a = seedListing("Spotlight Brand", "#ff7a59", "#241038", "solo");
  const b = seedListing("Panel Roundtable", "#2dd4bf", "#0c1e2c", "grid");
  let g = gallery.createGallery();
  g = gallery.saveListing(g, getFullListing(a, gallery.listListings(a)[0].id));
  g = gallery.saveListing(g, getFullListing(b, gallery.listListings(b)[0].id));
  const plan = home.buildGalleryPlan(gallery, g);
  assert.strictEqual(plan.maxPreviews, 3);
  assert.strictEqual(plan.previews.length, 2);
  assert.ok(plan.hasListings);
  // saveListing sorts by name (Panel < Spotlight), so previews[0] is the Panel tile.
  const byName = plan.previews.reduce(function (acc, tile) {
    acc[tile.name] = tile;
    return acc;
  }, {});
  assert.strictEqual(byName["Spotlight Brand"].accent, "#ff7a59");
  assert.strictEqual(byName["Spotlight Brand"].background, "#241038");
  assert.strictEqual(byName["Panel Roundtable"].accent, "#2dd4bf");
  assert.strictEqual(byName["Panel Roundtable"].background, "#0c1e2c");
  assert.strictEqual(plan.previews[0].presetName, "Split Stage");
  assert.strictEqual(plan.previews[0].actionId, "apply-gallery-listing");
});

test("buildGalleryPlan caps preview tiles at MAX_GALLERY_THUMBS", () => {
  let g = gallery.createGallery();
  for (let i = 0; i < 5; i += 1) {
    const seeded = seedListing(`Layout ${i}`, "#abcdef", "#123456", "split");
    g = gallery.saveListing(g, getFullListing(seeded, gallery.listListings(seeded)[0].id));
  }
  const plan = home.buildGalleryPlan(gallery, g);
  assert.strictEqual(plan.previews.length, home.MAX_GALLERY_THUMBS);
  assert.strictEqual(plan.previews.length, 3);
});

test("buildGalleryPlan returns no previews but still visible when gallery is empty", () => {
  const plan = home.buildGalleryPlan(gallery, gallery.createGallery());
  assert.strictEqual(plan.visible, true);
  assert.strictEqual(plan.hasListings, false);
  assert.strictEqual(plan.previews.length, 0);
});

// ---- home-screen module wiring --------------------------------------------

test("home-screen module is loaded by index.html before episode-setup.ui.js", () => {
  const homeIdx = indexHtml.indexOf("home-screen.js");
  const uiIdx = indexHtml.indexOf("episode-setup.ui.js");
  assert.ok(homeIdx > 0, "home-screen.js script tag is missing");
  assert.ok(uiIdx > 0, "episode-setup.ui.js script tag is missing");
  assert.ok(homeIdx < uiIdx, "home-screen.js must load before episode-setup.ui.js");
});

test("home-screen module is registered on window for the browser bundle", () => {
  assert.ok(/global\.PdcHomeScreen = api/.test(homeModule));
  assert.ok(/module\.exports = api/.test(homeModule), "CommonJS export present for tests");
  assert.ok(/buildHomePlan/.test(homeModule));
  assert.ok(/buildGalleryPlan/.test(homeModule));
});

// ---- UI smoke: renderShowLibrary uses the home plan -----------------------

test("renderShowLibrary consumes the home plan and renders one primary CTA", () => {
  assert.ok(/HOME\.buildHomePlan/.test(ui), "renderShowLibrary should call HOME.buildHomePlan");
  assert.ok(/renderHomePrimary\(homePlan\)/.test(ui));
  assert.ok(/renderHomeSecondary\(homePlan\)/.test(ui));
  assert.ok(/renderGalleryCard\(homePlan\)/.test(ui));
  assert.ok(/home-primary-card/.test(ui));
  assert.ok(/home-secondary-actions/.test(ui));
  assert.ok(/home-gallery-card/.test(ui));
  assert.ok(/home-screen-section/.test(ui));
});

test("home-screen dispatch covers every entry point the original buttons wired", () => {
  assert.ok(/dispatchHomeAction/.test(ui));
  assert.ok(/create-show/.test(ui));
  assert.ok(/resume-latest/.test(ui));
  assert.ok(/open-style-demo/.test(ui));
  assert.ok(/open-gallery-demo/.test(ui));
  assert.ok(/open-gallery-browse/.test(ui));
  assert.ok(/open-publish-demo/.test(ui));
  assert.ok(/start-blank-episode/.test(ui));
  assert.ok(/apply-gallery-listing/.test(ui));
});

// ---- CSS smoke ------------------------------------------------------------

test("styles.css adds the home-primary, secondary, and gallery-preview rules", () => {
  assert.ok(styles.includes(".home-primary-card"), "primary card style missing");
  assert.ok(styles.includes(".home-primary-btn"), "primary CTA style missing");
  assert.ok(styles.includes(".home-primary-badge"), "primary badge style missing");
  assert.ok(styles.includes(".home-secondary-actions"), "secondary row style missing");
  assert.ok(styles.includes(".home-gallery-thumb"), "gallery preview thumb style missing");
  assert.ok(styles.includes(".home-gallery-preview-grid"), "gallery preview grid missing");
  assert.ok(styles.includes(".home-gallery-thumb-meta"), "preset pill style missing");
});

// ---- ACCEPTANCE ------------------------------------------------------------

test("ACCEPTANCE: home screen exposes one primary CTA, quiet secondary row, polished gallery previews (#112)", () => {
  // Empty library → exactly one primary "Create a new show" CTA.
  library._resetCounters();
  const emptyPlan = home.buildHomePlan({
    libraryApi: library,
    galleryApi: gallery,
    library: library.createLibrary(),
    gallery: gallery.createGallery(),
  });
  assert.strictEqual(emptyPlan.primary.actionId, "create-show");
  assert.strictEqual(emptyPlan.secondary.length >= 4, true);
  assert.strictEqual(emptyPlan.gallery.visible, true);

  // Library with draft + gallery listings → primary switches to resume, gallery surfaces polished previews.
  let lib = library.createLibrary();
  const show = library.createShow("Founders Unfiltered");
  lib = library.addShow(lib, show);
  lib = library.addEpisode(lib, show.id, library.createEpisode(show.id, "Pilot", { status: library.EPISODE_STATUS.DRAFT }));
  const seeded = seedListing("Founders Split Look", "#6c4cff", "#10131f", "split");
  const g = gallery.createGallery();
  const populated = gallery.saveListing(g, getFullListing(seeded, gallery.listListings(seeded)[0].id));

  const plan = home.buildHomePlan({
    libraryApi: library,
    galleryApi: gallery,
    library: lib,
    gallery: populated,
  });
  assert.strictEqual(plan.primary.actionId, "resume-latest");
  assert.ok(plan.primary.episodeId);
  assert.strictEqual(plan.gallery.previews.length, 1);
  assert.strictEqual(plan.gallery.previews[0].name, "Founders Split Look");

  // The home plan + UI module + styles are all wired so the rendered screen is consistent.
  assert.ok(ui.includes(home.buildHomePlan.name));
  assert.ok(styles.includes(".home-primary-card"));
  assert.ok(indexHtml.includes("home-screen.js"));
});

console.log(`\nhome screen: ${passed} assertions passed`);
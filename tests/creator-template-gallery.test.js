"use strict";

// Creator template gallery smoke suite for Podcast Design Canvas (#106).
// Run with: `node tests/creator-template-gallery.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const editor = require("../app/canvas-editor.js");
const templates = require("../app/show-templates.js");
const brandKit = require("../app/show-brand-kit.js");
const gallery = require("../app/creator-template-gallery.js");

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
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal", fileName: "marco.mp4" }),
  ];
  return draft;
}

function twoSpeakerDraft() {
  const draft = setup.createDraft();
  draft.episodeName = "New Episode";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Alex Chen", fileName: "alex.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Jordan Lee", fileName: "jordan.mp4" }),
  ];
  return draft;
}

test("validateListingDraft requires name, description, and style tags", () => {
  const missingName = gallery.validateListingDraft({ name: "", description: "Interview layout", styleTags: ["interview"] });
  assert.strictEqual(missingName.ok, false);
  const missingDescription = gallery.validateListingDraft({ name: "Studio Split", description: "", styleTags: ["grid"] });
  assert.strictEqual(missingDescription.ok, false);
  const missingTags = gallery.validateListingDraft({ name: "Studio Split", description: "A clean split layout.", styleTags: [] });
  assert.strictEqual(missingTags.ok, false);
  const ok = gallery.validateListingDraft({
    name: "Studio Split",
    description: "A clean split layout for two-person interviews.",
    styleTags: ["grid", "interview", "invalid-tag"],
  });
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(ok.styleTags, ["grid", "interview"]);
});

test("buildPreviewImage returns an SVG data URL", () => {
  const image = gallery.buildPreviewImage(
    { background: "#10131f", accent: "#6c4cff", titleText: "Agency Weekly", speakerFrames: [{}, {}] },
    brandKit.createBrandKit("show-1", { logoLabel: "AW" }),
  );
  assert.ok(image.startsWith("data:image/svg+xml,"));
  assert.ok(decodeURIComponent(image).includes("Agency Weekly"));
});

test("publishListing stores browsable listings with preview metadata", () => {
  gallery._resetListingCounter();
  templates._resetTemplateCounter();
  const doc = { titleText: "Gallery Layout", presetName: "Split Stage", background: "#112233", accent: "#ff8844", speakerFrames: [{}, {}], layers: [] };
  const template = templates.createTemplate("Private Layout", doc, "tpl-private");
  const created = gallery.createListingFromSavedTemplate({
    template,
    description: "Bold split-screen interview look.",
    styleTags: ["interview", "bold-captions"],
    brandKit: brandKit.createBrandKit("show-1", { logoLabel: "Split Co" }),
  });
  assert.strictEqual(created.ok, true);
  const published = gallery.publishListing(gallery.createGallery(), created.listing);
  assert.strictEqual(published.ok, true);
  const list = gallery.listListings(published.gallery);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, "Private Layout");
  assert.ok(list[0].previewImage.startsWith("data:image/svg+xml,"));
  assert.deepStrictEqual(list[0].styleTagLabels, ["Interview", "Bold captions"]);
});

test("buildPreviewCanvas and applyListing adopt frames, captions, overlays, and brand styling", () => {
  gallery._resetListingCounter();
  templates._resetTemplateCounter();
  const episodeA = setup.summarize(completeUploadDraft());
  const selection = style.createSelection();
  selection.presetId = "split-stage";
  selection.layout = "split";
  const applied = style.summarizeStyle(selection, episodeA.speakerCount);
  let doc = editor.createFromStyle(applied, episodeA, selection);
  doc = editor.updateElement(doc, "titleText", "Creator Split Layout");
  doc = editor.updateElement(doc, "captionText", "Live from the studio");
  const kit = brandKit.createBrandKit("show-1", {
    logoLabel: "Split Co",
    colors: { background: "#15192b", accent: "#ffb347", text: "#ffffff" },
    captionStyle: "bold-lower-third",
  });
  doc = brandKit.applyToCanvas(doc, kit);

  const template = templates.createTemplate("Creator Split", doc, "tpl-creator");
  const created = gallery.createListingFromSavedTemplate({
    template,
    description: "Split stage with bold captions and brand overlays.",
    styleTags: ["brand-forward", "bold-captions"],
    brandKit: kit,
  });
  let store = gallery.createGallery();
  store = gallery.publishListing(store, created.listing).gallery;

  const episodeB = setup.summarize(twoSpeakerDraft());
  const listing = gallery.getListing(store, created.listing.id);
  const previewDoc = gallery.buildPreviewCanvas(listing, episodeB, style.createSelection());
  assert.strictEqual(previewDoc.titleText, "Creator Split Layout");
  assert.strictEqual(previewDoc.captionText, "Live from the studio");
  assert.strictEqual(previewDoc.speakerFrames.length, 2);
  assert.deepStrictEqual(previewDoc.speakerFrames.map((frame) => frame.name), ["Alex Chen", "Jordan Lee"]);
  assert.strictEqual(previewDoc.brandLogoLabel, "Split Co");

  const appliedListing = gallery.applyListing(listing, episodeB, style.createSelection());
  assert.strictEqual(appliedListing.ok, true);
  assert.strictEqual(appliedListing.canvasDoc.titleText, "Creator Split Layout");
  assert.strictEqual(appliedListing.appliedStyle.captionStyle, kit.captionStyleLabel);
  assert.ok(appliedListing.canvasDoc.layers.length >= 5, "saved layout layers carry over");
});

test("ensureStarterGallery seeds browsable sample layouts in a fresh gallery", () => {
  gallery._resetListingCounter();
  const seeded = gallery.ensureStarterGallery(gallery.createGallery());
  assert.ok(seeded.listings.length >= 3, "ships starter layouts for immediate browse/preview/apply");
  const list = gallery.listListings(seeded);
  list.forEach((item) => {
    assert.ok(item.previewImage.startsWith("data:image/svg+xml,"));
    assert.ok(item.description);
    assert.ok(item.styleTagLabels.length >= 1);
  });
});

test("createListingFromCanvas publishes without a saved private template", () => {
  gallery._resetListingCounter();
  const sample = gallery.samplePublishCanvas();
  assert.ok(sample && sample.canvas);
  const created = gallery.createListingFromCanvas({
    canvas: sample.canvas,
    name: "Creator Weekly Look",
    description: "A clean weekly show layout with branded captions.",
    styleTags: ["interview", "brand-forward"],
    brandKit: sample.brandKit,
  });
  assert.strictEqual(created.ok, true);
  const store = gallery.publishListing(gallery.createGallery(), created.listing).gallery;
  assert.strictEqual(gallery.listListings(store).length, 1);
});

test("serializeGallery and deserializeGallery round-trip published listings", () => {
  gallery._resetListingCounter();
  templates._resetTemplateCounter();
  const template = templates.createTemplate("Round Trip", { titleText: "Weekly", presetName: "Studio Spotlight", speakerFrames: [{}], layers: [] }, "tpl-rt");
  const created = gallery.createListingFromSavedTemplate({
    template,
    description: "Weekly show look.",
    styleTags: ["spotlight"],
  });
  const store = gallery.publishListing(gallery.createGallery(), created.listing).gallery;
  const restored = gallery.deserializeGallery(gallery.serializeGallery(store));
  assert.strictEqual(gallery.listListings(restored).length, 1);
  assert.strictEqual(gallery.getListing(restored, created.listing.id).description, "Weekly show look.");
});

test("ACCEPTANCE: publish saved layout to gallery, browse, preview, and apply on a new episode", () => {
  gallery._resetListingCounter();
  templates._resetTemplateCounter();
  const draftA = completeUploadDraft();
  const episodeA = setup.summarize(draftA);
  const selection = style.createSelection();
  selection.presetId = "studio-spotlight";
  const applied = style.summarizeStyle(selection, episodeA.speakerCount);
  let doc = editor.createFromStyle(applied, episodeA, selection);
  doc = editor.updateElement(doc, "titleText", "Founders Gallery Layout");
  const kit = brandKit.createBrandKit("show-founders", { logoLabel: "FU", captionStyle: "clean-bar" });
  doc = brandKit.applyToCanvas(doc, kit);

  let templateStore = templates.createStore();
  const template = templates.createTemplate("Founders Spotlight", doc, "tpl-founders");
  templateStore = templates.saveTemplate(templateStore, template);

  const created = gallery.createListingFromSavedTemplate({
    template: templates.getTemplate(templateStore, "tpl-founders"),
    name: "Founders Spotlight Gallery",
    description: "Spotlight interview layout with clean captions and show branding.",
    styleTags: ["spotlight", "interview", "brand-forward"],
    brandKit: kit,
  });
  assert.strictEqual(created.ok, true);

  let galleryStore = gallery.createGallery();
  const published = gallery.publishListing(galleryStore, created.listing);
  assert.strictEqual(published.ok, true);
  galleryStore = published.gallery;
  assert.strictEqual(gallery.listListings(galleryStore).length, 1);

  const episodeB = setup.summarize(twoSpeakerDraft());
  const listing = gallery.getListing(galleryStore, created.listing.id);
  const previewDoc = gallery.buildPreviewCanvas(listing, episodeB, style.createSelection());
  assert.strictEqual(previewDoc.speakerFrames.length, 2);

  const appliedListing = gallery.applyListing(listing, episodeB, style.createSelection());
  assert.strictEqual(appliedListing.ok, true);
  assert.strictEqual(appliedListing.canvasDoc.titleText, "Founders Gallery Layout");
  assert.strictEqual(appliedListing.brandKit.logoLabel, "FU");
  assert.strictEqual(appliedListing.appliedStyle.brandApplied, true);
  assert.ok(gallery.summarizeListing(listing).includes("Founders Spotlight Gallery"));
});

console.log(`\ncreator template gallery: ${passed} assertions passed`);

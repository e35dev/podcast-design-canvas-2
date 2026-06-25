"use strict";

// Show identity start smoke suite for Podcast Design Canvas (#57).
// Run with: `node tests/show-identity.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const editor = require("../app/canvas-editor.js");
const templates = require("../app/show-templates.js");
const library = require("../app/show-library.js");
const brandKit = require("../app/show-brand-kit.js");
const identity = require("../app/show-identity.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function sampleKit(showId) {
  return brandKit.createBrandKit(showId, {
    logoLabel: "Founders mark",
    colors: {
      primary: "#6c4cff",
      secondary: "#10131f",
      background: "#0d1117",
      accent: "#ffb347",
      text: "#f6f7fb",
    },
    typeStyle: "bold-display",
    captionStyle: "big-animated",
  });
}

function buildShowWithTemplate() {
  templates._resetTemplateCounter();
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
  ];
  const episode = setup.summarize(draft);
  const selection = style.createSelection();
  selection.presetId = "studio-spotlight";
  selection.layout = "spotlight";
  const applied = style.summarizeStyle(selection, episode.speakerCount);
  let doc = editor.createFromStyle(applied, episode, selection);
  doc = editor.updateElement(doc, "titleText", "Founders Spotlight Layout");
  const template = templates.createTemplate("Founders Format", doc, "tpl-founders");
  let store = templates.createStore();
  store = templates.saveTemplate(store, template);
  return { episode, template, store, applied };
}

test("applyToDraft prefills episode name, source mode, and host social defaults", () => {
  library._resetCounters();
  const show = library.createShow("Founders Unfiltered", {
    id: "show-1",
    defaultSourceMode: "upload",
    defaultSpeakers: [
      Object.assign(setup.createSpeaker("Host"), {
        name: "Sam Rivera",
        social: { website: "https://samrivera.show", twitter: "", instagram: "", linkedin: "" },
      }),
      setup.createSpeaker("Guest 1"),
    ],
    episodes: [{ id: "ep-1", name: "Pilot", status: "exported", createdAt: 1 }],
  });
  const applied = identity.applyToDraft(show, setup.createDraft());
  assert.strictEqual(applied.fromShow, true);
  assert.ok(/Episode 2/.test(applied.draft.episodeName));
  assert.strictEqual(applied.draft.sourceMode, "upload");
  assert.strictEqual(applied.draft.speakers[0].name, "Sam Rivera");
  assert.strictEqual(applied.draft.speakers[0].social.website, "https://samrivera.show");
  assert.strictEqual(applied.draft.speakers[0].fileName, "");
});

test("applyStartContext applies saved template, style defaults, and brand kit to canvas", () => {
  library._resetCounters();
  brandKit._resetOverlayCounter();
  const built = buildShowWithTemplate();
  const show = library.createShow("Founders Unfiltered", {
    id: "show-founders",
    templateId: "tpl-founders",
    templateName: "Founders Format",
    presetName: "Studio Spotlight",
    brandKit: sampleKit("show-founders"),
  });
  const episode = setup.summarize(identity.applyToDraft(show, setup.createDraft()).draft);
  const ctx = identity.applyStartContext(show, built.store, episode);
  assert.strictEqual(ctx.activeTemplateId, "tpl-founders");
  assert.strictEqual(ctx.styleSelection.presetId, "studio-spotlight");
  assert.ok(ctx.canvasDoc);
  assert.strictEqual(ctx.canvasDoc.titleText, "Founders Spotlight Layout");
  assert.strictEqual(ctx.canvasDoc.background, "#0d1117");
  assert.strictEqual(ctx.activeBrandKit.logoLabel, "Founders mark");
});

test("applyAfterSetup brands the applied style summary for workspace and export", () => {
  library._resetCounters();
  brandKit._resetOverlayCounter();
  const built = buildShowWithTemplate();
  const show = library.createShow("Founders Unfiltered", {
    id: "show-founders",
    templateId: "tpl-founders",
    templateName: "Founders Format",
    presetName: "Studio Spotlight",
    brandKit: sampleKit("show-founders"),
    defaultSpeakers: [
      Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera" }),
      Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim" }),
    ],
  });
  const draft = identity.applyToDraft(show, setup.createDraft()).draft;
  const episode = setup.summarize(draft);
  const after = identity.applyAfterSetup(show, built.store, episode, draft);
  assert.ok(after.appliedStyle);
  assert.strictEqual(after.appliedStyle.brandApplied, true);
  assert.strictEqual(after.appliedStyle.background, "#0d1117");
  assert.strictEqual(after.appliedStyle.captionStyle, "Big animated captions");
});

test("captureDefaultsFromDraft stores reusable host and social context on the show", () => {
  const draft = setup.createDraft();
  draft.sourceMode = "riverside";
  draft.speakers[0].name = "Alex Chen";
  draft.speakers[0].social.website = "https://alexchen.fm";
  const defaults = identity.captureDefaultsFromDraft(draft);
  assert.strictEqual(defaults.defaultSourceMode, "riverside");
  assert.strictEqual(defaults.defaultSpeakers[0].name, "Alex Chen");
  assert.strictEqual(defaults.defaultSpeakers[0].social.website, "https://alexchen.fm");
  assert.strictEqual(defaults.defaultSpeakers[0].fileName, "");
});

test("deserializeLibrary hydrates show and episode counters to avoid id collisions", () => {
  library._resetCounters();
  let lib = library.createLibrary();
  lib = library.addShow(lib, library.createShow("Alpha", { id: "show-8" }));
  lib = library.addEpisode(lib, "show-8", library.createEpisode("show-8", "Episode 1", { id: "ep-12" }));
  library.deserializeLibrary(library.serializeLibrary(lib));
  const nextShow = library.createShow("Beta");
  const nextEp = library.createEpisode(nextShow.id, "Episode 2");
  assert.ok(Number(nextShow.id.replace("show-", "")) > 8);
  assert.ok(Number(nextEp.id.replace("ep-", "")) > 12);
});

test("ACCEPTANCE: start from saved show identity vs blank episode", () => {
  library._resetCounters();
  brandKit._resetOverlayCounter();
  templates._resetTemplateCounter();
  const built = buildShowWithTemplate();

  let lib = library.createLibrary();
  const kit = sampleKit("show-founders");
  const show = library.createShow("Founders Unfiltered", {
    id: "show-founders",
    templateId: "tpl-founders",
    templateName: "Founders Format",
    presetName: "Studio Spotlight",
    brandKit: kit,
    defaultSpeakers: [
      Object.assign(setup.createSpeaker("Host"), {
        name: "Sam Rivera",
        social: { website: "https://samrivera.show", twitter: "", instagram: "", linkedin: "" },
      }),
      Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim" }),
    ],
  });
  lib = library.addShow(lib, show);

  const fromShow = identity.applyToDraft(library.getShow(lib, "show-founders"), setup.createDraft());
  assert.strictEqual(fromShow.fromShow, true);
  assert.strictEqual(fromShow.draft.speakers[0].name, "Sam Rivera");

  const episode = setup.summarize(fromShow.draft);
  const startCtx = identity.applyStartContext(library.getShow(lib, "show-founders"), built.store, episode);
  const branded = identity.applyAfterSetup(library.getShow(lib, "show-founders"), built.store, episode, fromShow.draft);
  const summary = identity.buildIdentitySummary(library.getShow(lib, "show-founders"));
  assert.strictEqual(summary.active, true);
  assert.ok(summary.workspaceLine.indexOf("Founders Unfiltered") >= 0);
  assert.ok(summary.workspaceLine.indexOf("Founders Format") >= 0);
  assert.strictEqual(branded.appliedStyle.brandApplied, true);
  assert.strictEqual(startCtx.canvasDoc.speakerFrames[0].name, "Sam Rivera");

  const blank = identity.applyToDraft(null, setup.createDraft());
  assert.strictEqual(blank.fromShow, false);
  assert.strictEqual(blank.draft.episodeName, "");
  assert.strictEqual(blank.draft.speakers[0].name, "");

  lib = library.saveShowDefaults(lib, "show-founders", identity.captureDefaultsFromDraft(fromShow.draft));
  const stored = library.getShow(lib, "show-founders");
  assert.strictEqual(stored.defaultSpeakers[0].social.website, "https://samrivera.show");
});

console.log(`\nshow identity: ${passed} assertions passed`);

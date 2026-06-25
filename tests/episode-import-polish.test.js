"use strict";

// Episode import polish smoke suite for Podcast Design Canvas (#77).
// Run with: `node tests/episode-import-polish.test.js`.

const assert = require("assert");
const polish = require("../app/episode-import-polish.js");
const onboarding = require("../app/show-onboarding.js");
const library = require("../app/show-library.js");
const setup = require("../app/episode-setup.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

test("primary and secondary CTA classes are consistent across import screens", () => {
  assert.strictEqual(polish.primaryCtaClass(), "primary");
  assert.strictEqual(polish.secondaryCtaClass(), "ghost");
  assert.strictEqual(polish.PRIMARY_CTA_CLASS, polish.primaryCtaClass());
  assert.strictEqual(polish.SECONDARY_CTA_CLASS, polish.secondaryCtaClass());
});

test("setup layout classes leave room between sections and speaker cards", () => {
  const classes = polish.setupClasses();
  const spacing = polish.layoutSpacing();

  assert.ok(classes.form.includes("setup-import"));
  assert.ok(classes.speakerCard.includes("speaker-source-card"));
  assert.ok(spacing.sectionGapPx >= 20);
  assert.ok(spacing.speakerStackGapPx >= 16);
  assert.ok(spacing.speakerCardPaddingPx >= 20);
  assert.ok(spacing.mobileBreakpointPx <= 768);
});

test("import path screens cover library through episode setup", () => {
  const screens = polish.importPathScreens();
  assert.ok(screens.includes("library"));
  assert.ok(screens.includes("new-show"));
  assert.ok(screens.includes("episode-setup"));
});

test("ACCEPTANCE: polished import path keeps onboarding flow and readable setup labels", () => {
  const labels = polish.consistentPrimaryLabels();
  assert.ok(/import episode/.test(labels.createShow));
  assert.ok(/audio polish/.test(labels.continueImport));

  library._resetCounters();
  let lib = library.createLibrary();
  const show = library.createShow("Founders Unfiltered");
  lib = library.addShow(lib, show);
  assert.strictEqual(onboarding.firstStepAfterCreateShow(), "episode-setup");

  const draft = setup.createDraft();
  draft.episodeName = "Episode 1";
  draft.speakers[0].name = "Sam Rivera";
  draft.speakers[0].fileName = "sam.mp4";
  assert.strictEqual(setup.validateDraft(draft).ok, true);

  const spacing = polish.layoutSpacing();
  assert.ok(spacing.fieldGapPx >= 16);
  assert.strictEqual(polish.setupClasses().actions, "actions setup-actions");
});

console.log(`\nepisode-import-polish: ${passed} passed`);

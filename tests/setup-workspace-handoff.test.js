"use strict";

// Setup completion into workspace smoke suite for Podcast Design Canvas (#149).
// Run with: `node tests/setup-workspace-handoff.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

function completeDraft() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered — Episode 1";
  draft.riversideLink = "https://riverside.fm/studio/founders-ep1";
  draft.speakers.forEach((speaker, index) => {
    speaker.name = ["Sam Rivera", "Dana Kim", "Alex Chen"][index];
  });
  draft.speakers[0].social.website = "https://sam.example";
  return draft;
}

test("buildSetupCompletionHandoff carries episode title, preset, source, and roles", () => {
  const summary = setup.summarize(completeDraft());
  const completion = setup.buildSetupCompletionHandoff(summary, { presetSummary: "Studio Spotlight · Side by side" });
  assert.strictEqual(completion.completionEyebrow, "Setup complete");
  assert.strictEqual(completion.episodeTitle, "Founders Unfiltered — Episode 1");
  assert.ok(completion.presetSummary.includes("Studio Spotlight"));
  assert.ok(completion.handoff.sourceDetail.includes("riverside.fm"));
  assert.ok(completion.roleSummary.includes("Sam Rivera"));
  assert.ok(completion.roleSummary.includes("Host"));
});

test("setup screen exposes sticky complete action and handoff summary", () => {
  assert.ok(ui.includes("Complete setup & open workspace"));
  assert.ok(ui.includes("setup-cta-bar-sticky"));
  assert.ok(ui.includes("setup-continue-summary"));
  assert.ok(ui.includes("buildSetupCompletionHandoff"));
  assert.ok(styles.includes(".setup-cta-bar-sticky"));
});

test("ACCEPTANCE: continue path lands in workspace with preset saved from setup selection", () => {
  const selection = style.applyPresetToSelection(style.createSelection(), "split-stage", false);
  const summary = style.summarizeStyle(selection, 3);
  assert.ok(summary.presetName.length > 0);
  const continueBlock = ui.slice(ui.indexOf("function onContinue()"), ui.indexOf("function focusFirstError()"));
  assert.ok(continueBlock.includes("renderWorkspace(summary)"));
  assert.ok(continueBlock.includes("ensureSetupStyleApplied"));
  const completion = setup.buildSetupCompletionHandoff(setup.summarize(completeDraft()), {
    presetSummary: summary.presetName,
  });
  assert.strictEqual(completion.presetSummary, summary.presetName);
});

console.log(`\nsetup workspace handoff: ${passed} assertions passed`);

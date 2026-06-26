"use strict";

// Canonical speaker bucket handoff for setup completion (#182).
// Run with: `node tests/setup-speaker-handoff.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const workspace = require("../app/episode-workspace.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function assignedRiversideDraft() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered — Episode 1";
  draft.riversideLink = "https://riverside.fm/studio/founders-ep1";
  draft.speakers[0].name = "Sam Rivera";
  draft.speakers[1].name = "Dana Kim";
  draft.speakers[2].name = "Alex Chen";
  return draft;
}

test("canonicalSpeakers dedupes by role and avoids role placeholder names in identity lines", () => {
  const summary = setup.summarize({
    episodeName: "Demo",
    sourceMode: "riverside",
    riversideLink: setup.sandboxDemoRiversideLink(),
    speakers: [
      { role: "Host", name: "Host", sourceLabel: "Riverside recording", social: [] },
      { role: "Guest 1", name: "Guest 1", sourceLabel: "Riverside recording", social: [] },
      { role: "Guest 2", name: "Guest 2", sourceLabel: "Riverside recording", social: [] },
      { role: "Host", name: "Duplicate Host", sourceLabel: "Riverside recording", social: [] },
    ],
  });
  const speakers = setup.canonicalSpeakers(summary);
  assert.strictEqual(speakers.length, 3);
  assert.deepStrictEqual(speakers.map((speaker) => speaker.role), ["Host", "Guest 1", "Guest 2"]);
  assert.strictEqual(speakers[0].identityLine, "Host");
  assert.strictEqual(speakers[1].identityLine, "Guest 1");
});

test("displaySourceDetail hides sandbox demo URL text from setup recap", () => {
  const summary = setup.summarize(setup.applySandboxHandoffSource(setup.createDraft()));
  assert.ok(setup.isSandboxDemoRiversideLink(summary.riversideLink));
  const detail = setup.displaySourceDetail(summary);
  assert.ok(!/canvas demo/i.test(detail));
  assert.ok(!/podcast-canvas-demo/i.test(detail));
  assert.ok(/riverside recording/i.test(detail));
});

test("buildSetupCompletionHandoff shows each assigned bucket once with name and source", () => {
  const summary = setup.summarize(assignedRiversideDraft());
  const completion = setup.buildSetupCompletionHandoff(summary, { presetSummary: "Studio Spotlight" });
  assert.strictEqual(completion.roleSummary, "Sam Rivera · Host · Dana Kim · Guest 1 · Alex Chen · Guest 2");
  assert.strictEqual(completion.handoff.speakers.length, 3);
  assert.strictEqual(completion.handoff.speakers[0].name, "Sam Rivera");
  assert.strictEqual(completion.handoff.speakers[0].sourceLabel, "Riverside recording");
  assert.ok(!/canvas demo/i.test(completion.handoff.sourceDetail));
});

test("workspace setup stage uses the same canonical speaker identities", () => {
  const summary = setup.summarize(assignedRiversideDraft());
  const ws = workspace.buildWorkspace(summary, {
    appliedStyle: { presetName: "Studio Spotlight", layoutLabel: "Side by side" },
  });
  const setupStage = workspace.getStage(ws, "setup");
  assert.ok(setupStage.summary.includes("Sam Rivera (Host)"));
  assert.ok(setupStage.summary.includes("Dana Kim (Guest 1)"));
  assert.ok(setupStage.summary.includes("Alex Chen (Guest 2)"));
  assert.ok(!setupStage.summary.includes("Host (Host)"));
});

test("ACCEPTANCE: assigned Host/Guest buckets survive setup recap without duplicate roles or demo text", () => {
  const draft = assignedRiversideDraft();
  assert.strictEqual(setup.validateDraft(draft).ok, true);
  const selection = style.createSelection();
  const presetSummary = style.summarizeStyle(selection, draft.speakers.length).presetName;
  const summary = setup.summarize(draft);
  const completion = setup.buildSetupCompletionHandoff(summary, { presetSummary });

  completion.handoff.speakers.forEach((speaker) => {
    assert.ok(!speaker.identityLine.includes(`${speaker.role} · ${speaker.role}`));
    assert.ok(!/canvas demo/i.test(speaker.sourceLabel));
  });
  assert.strictEqual(
    completion.handoff.speakers.map((speaker) => speaker.role).join(","),
    "Host,Guest 1,Guest 2",
  );
  assert.ok(completion.roleSummary.includes("Sam Rivera"));
  assert.ok(!/podcast-canvas-demo/i.test(completion.handoff.sourceDetail));
});

test("UI recap uses canonical speaker handoff helpers", () => {
  const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
  assert.ok(ui.includes("canonicalSpeakers"));
  assert.ok(ui.includes("isRolePlaceholderName"));
  assert.ok(ui.includes("buildRoleSummary"));
});

console.log(`\nsetup speaker handoff: ${passed} test(s) passed.`);

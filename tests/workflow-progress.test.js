"use strict";

// Workflow progress and draft resume smoke suite for Podcast Design Canvas (#89).
// Run with: `node tests/workflow-progress.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const library = require("../app/show-library.js");
const flow = require("../app/episode-flow.js");
const onboarding = require("../app/show-onboarding.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

test("parseStepLabel and stepIndicatorForLabel expose prominent workflow progress", () => {
  const parsed = flow.parseStepLabel("Step 3 of 8 · Audio polish");
  assert.strictEqual(parsed.step, 3);
  assert.strictEqual(parsed.total, 8);
  const indicator = flow.stepIndicatorForLabel("Step 3 of 8 · Audio polish");
  assert.strictEqual(indicator.countText, "Step 3 of 8");
  assert.strictEqual(indicator.labelText, "Audio polish");
  assert.ok(indicator.progress > 0.3 && indicator.progress < 0.4);
});

test("stepIndicatorForWorkspaceStage maps the active production stage to a step", () => {
  const indicator = flow.stepIndicatorForWorkspaceStage("style");
  assert.strictEqual(indicator.step, 4);
  assert.strictEqual(indicator.labelText, "Choose a style");
});

test("latestResumableDraft prefers the newest draft or in-progress episode", () => {
  const episodes = [
    { id: "ep-1", name: "Older draft", status: "draft", createdAt: 1 },
    { id: "ep-2", name: "Latest draft", status: "draft", createdAt: 3 },
    { id: "ep-3", name: "Exported", status: "exported", createdAt: 4 },
  ];
  const latest = flow.latestResumableDraft(episodes);
  assert.strictEqual(latest.id, "ep-2");
});

test("resumeDestination returns workspace when production progress was saved", () => {
  assert.strictEqual(flow.resumeDestination({ workspaceReached: true }), "workspace");
  assert.strictEqual(flow.resumeDestination({ setupComplete: true, lastView: "style" }), "style");
  assert.strictEqual(flow.resumeDestination({ setupComplete: false }), "setup");
});

test("showDetailSections promotes resume when a draft episode exists", () => {
  library._resetCounters();
  const show = library.createShow("Founders Unfiltered");
  show.episodes = [
    library.createEpisode(show.id, "Founders — Episode 1", { id: "ep-draft", status: library.EPISODE_STATUS.DRAFT }),
  ];
  const sections = onboarding.showDetailSections(show);
  assert.strictEqual(sections.primary.mode, "resume");
  assert.strictEqual(sections.primary.episodeId, "ep-draft");
  assert.ok(/Resume/i.test(sections.primary.actionLabel));
});

test("UI wires workflow indicator, draft resume, and workspace next action (#89)", () => {
  assert.ok(html.includes("workflow-step-indicator"));
  assert.ok(ui.includes("resumeEpisodeFromShow"));
  assert.ok(ui.includes("workspace-handoff-primary-btn"));
  assert.ok(ui.includes("workspace-production-checklist"));
  assert.ok(ui.includes("setWorkspaceStep"));
  assert.ok(ui.includes("persistEpisodeSession"));
  assert.ok(styles.includes(".workspace-handoff-layout"));
  assert.ok(styles.includes(".workspace-production-checklist"));
  assert.ok(styles.includes(".show-episode-card-resumable"));
});

test("ACCEPTANCE: draft episode resume lands in workspace when progress was saved", () => {
  const destination = flow.resumeDestination({
    setupComplete: true,
    workspaceReached: true,
    lastView: "workspace",
  });
  assert.strictEqual(destination, "workspace");
  const resume = flow.summarizeResumeAction({
    id: "ep-draft",
    name: "Founders — Episode 1",
    status: "draft",
  });
  assert.ok(/Founders — Episode 1/.test(resume.title));
  assert.ok(/Resume draft episode/.test(resume.actionLabel));
});

test("nextStepAfterAudio advances the indicator into the visual moments workflow (#269)", () => {
  const next = flow.nextStepAfterAudio();
  assert.strictEqual(next.id, "moments");
  assert.strictEqual(next.step, 4);
  assert.strictEqual(next.stepLabel, "Step 4 of 8 · Visual moments");
  // The forward step must be the visual moments workflow, not "Choose a style".
  assert.ok(/Visual moments/i.test(next.stepLabel));
  assert.ok(!/style/i.test(next.stepLabel));
});

test("momentsContextFromAudio carries polished tracks + speaker/episode context (#269)", () => {
  const summary = {
    episodeName: "Founders — Episode 12",
    speakerCount: 2,
    speakers: [
      { role: "Host", name: "Avery" },
      { role: "Guest 1", name: "Jordan" },
    ],
  };
  const applied = {
    allTracksPolished: true,
    polishedTrackCount: 2,
    polishedTracks: [
      { trackIndex: 0, status: "complete", polishedAsset: { assetId: "a1" } },
      { trackIndex: 1, status: "complete", polishedAsset: { assetId: "a2" } },
    ],
  };
  const context = flow.momentsContextFromAudio(summary, applied);
  assert.strictEqual(context.episodeName, "Founders — Episode 12");
  assert.strictEqual(context.speakerCount, 2);
  assert.strictEqual(context.speakers.length, 2);
  assert.strictEqual(context.speakers[0].name, "Avery");
  // Step 4 visual moments has access to the polished-track outputs from audio polish.
  assert.strictEqual(context.polishedTrackCount, 2);
  assert.strictEqual(context.polishedTracks.length, 2);
  assert.strictEqual(context.polishedTracks[0].polishedAsset.assetId, "a1");
  assert.strictEqual(context.allTracksPolished, true);
});

test("momentsContextFromAudio degrades safely without applied polish", () => {
  const context = flow.momentsContextFromAudio({ episodeName: "Untitled" }, null);
  assert.strictEqual(context.episodeName, "Untitled");
  assert.strictEqual(context.speakerCount, 0);
  assert.deepStrictEqual(context.polishedTracks, []);
  assert.strictEqual(context.allTracksPolished, false);
});

test("UI wires the post-audio forward action to the visual moments editor (#269)", () => {
  // After Apply, the primary forward action opens the visual moments workflow...
  assert.ok(ui.includes("Add visual moments →"));
  assert.ok(ui.includes("FLOW.nextStepAfterAudio()"));
  // ...by rendering the moments editor with the forward Step 4 indicator.
  assert.ok(/renderVisualMoments\(summary,\s*\{\s*stepLabel:[^}]*fromAudio:\s*true/.test(ui));
  // Back-to-setup remains available, so it is not the only post-apply path.
  assert.ok(ui.includes("← Back to setup"));
  // The forward step is the moments editor, not the style chooser.
  assert.ok(ui.includes("renderVisualMoments"));
});

test("ACCEPTANCE: applied audio polish continues forward to the Step 4 visual moments workflow (#269)", () => {
  const next = flow.nextStepAfterAudio();
  const summary = {
    episodeName: "Founders — Episode 12",
    speakerCount: 2,
    speakers: [{ role: "Host", name: "Avery" }, { role: "Guest 1", name: "Jordan" }],
  };
  const applied = {
    allTracksPolished: true,
    polishedTrackCount: 2,
    polishedTracks: [{ trackIndex: 0 }, { trackIndex: 1 }],
  };
  const context = flow.momentsContextFromAudio(summary, applied);
  // Advances to Step 4 visual moments...
  assert.strictEqual(next.step, 4);
  assert.strictEqual(next.id, "moments");
  // ...with access to the polished tracks and the correct speakers/episode context.
  assert.strictEqual(context.polishedTracks.length, 2);
  assert.strictEqual(context.speakerCount, 2);
  assert.strictEqual(context.episodeName, "Founders — Episode 12");
});

console.log(`\nworkflow progress: ${passed} assertions passed`);

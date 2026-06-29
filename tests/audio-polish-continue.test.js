"use strict";

// Audio polish → visual moments handoff smoke suite (#269).
// Run with: `node tests/audio-polish-continue.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");
const workspace = require("../app/episode-workspace.js");
const flow = require("../app/episode-flow.js");

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
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.wav" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.wav" }),
  ];
  draft.speakers.forEach((speaker, index) => {
    setup.attachSourceMediaAsset(speaker, {
      assetId: `continue-media-${index + 1}`,
      fileName: speaker.fileName,
      fileSize: 4096,
      mimeType: "audio/wav",
      storage: "indexedDB",
    });
  });
  return draft;
}

test("UI wires audio polish forward action into visual moments (#269)", () => {
  assert.ok(ui.includes("function continueToVisualMoments(summary)"));
  assert.ok(ui.includes("continueToVisualMoments(summary)"));
  assert.ok(ui.includes("function renderPolishedAudioRecap(summary)"));
  assert.ok(ui.includes("Continue to visual moments"));
  assert.ok(ui.includes("Upload speaker files in setup"));
  assert.ok(ui.includes("audio-polish-blocker"));
  assert.ok(ui.includes("moments-audio-recap"));
  assert.ok(styles.includes(".moments-audio-recap"));
});

test("resumeDestination returns visual moments when that was the last production view", () => {
  assert.strictEqual(flow.resumeDestination({
    setupComplete: true,
    workspaceReached: true,
    lastView: "moments",
  }), "moments");
  assert.strictEqual(flow.resumeDestination({
    setupComplete: true,
    workspaceReached: true,
    lastView: "audio",
  }), "audio");
});

test("workspace recommends visual moments after audio polish is applied", () => {
  const episode = setup.summarize(completeDraft());
  const polish = audio.applyPolishForEpisode(episode).applied;
  const ws = workspace.buildWorkspace(episode, {
    appliedStyle: null,
    audioPolish: polish,
    templateName: "",
    momentsSummary: { total: 0, visibleCount: 0 },
    contextApproved: true,
    exportReady: false,
    publishReviewApproved: false,
    exportStatus: "draft",
    exportDownloadName: "",
  });
  const momentsStage = workspace.getStage(ws, "moments");
  assert.strictEqual(momentsStage.status, workspace.STATUS.ATTENTION);
  assert.strictEqual(ws.currentStageId, "moments");
  assert.strictEqual(momentsStage.actionLabel, "Add moments");
});

test("ACCEPTANCE: polished audio can continue into visual moments workflow (#269)", () => {
  const episode = setup.summarize(completeDraft());
  const polish = audio.applyPolishForEpisode(episode).applied;
  assert.strictEqual(polish.allTracksPolished, true);
  assert.ok(polish.polishedTrackCount >= 2);
  const ws = workspace.buildWorkspace(episode, {
    appliedStyle: null,
    audioPolish: polish,
    templateName: "",
    momentsSummary: { total: 0, visibleCount: 0 },
    contextApproved: true,
    exportReady: false,
    publishReviewApproved: false,
    exportStatus: "draft",
    exportDownloadName: "",
  });
  assert.strictEqual(workspace.getStage(ws, "audio").status, workspace.STATUS.COMPLETE);
  assert.strictEqual(workspace.getStage(ws, "moments").status, workspace.STATUS.ATTENTION);
  assert.strictEqual(flow.resumeDestination({
    setupComplete: true,
    workspaceReached: true,
    lastView: "moments",
    appliedAudioPolish: polish,
  }), "moments");
});

console.log(`\naudio polish continue: ${passed} assertions passed`);

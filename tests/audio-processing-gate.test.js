"use strict";

// Cross-module audio-processing gate suite for Podcast Design Canvas (#197).
// Confirms that episode-workspace, episode-export, and publish-review all require
// every speaker track to be actually polished — not just a preset chosen — before
// treating audio as complete / export-ready. Run with: `node tests/audio-processing-gate.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");
const workspace = require("../app/episode-workspace.js");
const exportModel = require("../app/episode-export.js");
const review = require("../app/publish-review.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function readyEpisode() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
  ];
  return setup.summarize(draft);
}

function styleContext() {
  return { presetName: "Studio Spotlight", layoutLabel: "Side by side", pacingLabel: "Brisk" };
}

test("episode-workspace: audio stage stays ACTIVE when a preset is chosen but tracks aren't processed", () => {
  const episode = readyEpisode();
  const pendingPolish = audio.summarizePolish(audio.createPolish(episode));
  const ws = workspace.buildWorkspace(episode, { appliedStyle: styleContext(), audioPolish: pendingPolish });
  const audioStage = workspace.getStage(ws, "audio");
  assert.strictEqual(audioStage.status, "active");
  assert.ok(/chosen — apply it/.test(audioStage.summary));
});

test("episode-workspace: audio stage becomes COMPLETE only once every track is polished", () => {
  const episode = readyEpisode();
  const polished = audio.summarizePolish(audio.processTracks(audio.createPolish(episode)));
  const ws = workspace.buildWorkspace(episode, { appliedStyle: styleContext(), audioPolish: polished });
  const audioStage = workspace.getStage(ws, "audio");
  assert.strictEqual(audioStage.status, "complete");
  assert.ok(audioStage.summary.includes("2/2 tracks polished"));
});

test("episode-export: validateReadiness blocks export until every track is polished", () => {
  const episode = readyEpisode();
  const pendingPolish = audio.summarizePolish(audio.createPolish(episode));
  const blocked = exportModel.validateReadiness({ audioPolish: pendingPolish, appliedStyle: styleContext() });
  assert.strictEqual(blocked.ok, false);
  assert.ok(blocked.missing.includes("audio"));

  const polished = audio.summarizePolish(audio.processTracks(audio.createPolish(episode)));
  const ready = exportModel.validateReadiness({ audioPolish: polished, appliedStyle: styleContext() });
  assert.strictEqual(ready.ok, true);
});

test("episode-export: final summary carries the polished track references forward, not raw sources", () => {
  const episode = readyEpisode();
  const polished = audio.summarizePolish(audio.processTracks(audio.createPolish(episode)));
  const ctx = { audioPolish: polished, appliedStyle: styleContext() };
  const job = exportModel.createExport(episode, {});
  const finalSummary = exportModel.buildFinalSummary(episode, ctx, job);
  assert.strictEqual(finalSummary.polishedAudioTracks.length, 2);
  finalSummary.polishedAudioTracks.forEach((track) => assert.ok(track.outputRef));
  assert.ok(finalSummary.lines.some((line) => line.includes("2/2 tracks polished")));
});

test("publish-review: blocks approval with 'incomplete' messaging when preset chosen but not applied", () => {
  const episode = readyEpisode();
  const pendingPolish = audio.summarizePolish(audio.createPolish(episode));
  const r = review.createReview(episode, { audioPolish: pendingPolish, appliedStyle: styleContext() });
  const audioCheck = r.checks.find((item) => item.sectionId === "audio");
  assert.strictEqual(audioCheck.id, "audio-incomplete");
  assert.strictEqual(audioCheck.passed, false);
  assert.strictEqual(review.canApprove(r), false);
});

test("publish-review: approves audio section and unlocks export readiness once tracks are polished", () => {
  const episode = readyEpisode();
  const polished = audio.summarizePolish(audio.processTracks(audio.createPolish(episode)));
  const r = review.createReview(episode, { audioPolish: polished, appliedStyle: styleContext() });
  const audioCheck = r.checks.find((item) => item.sectionId === "audio");
  assert.strictEqual(audioCheck.id, "audio-ready");
  assert.strictEqual(audioCheck.passed, true);
  const exportCheck = r.checks.find((item) => item.id === "export-ready");
  assert.ok(exportCheck, "export should be marked ready once audio and style are both fully set");
});

console.log(`\naudio processing gate: ${passed} assertions passed`);

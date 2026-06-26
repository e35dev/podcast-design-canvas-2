"use strict";

// Audio polish processing smoke suite for Podcast Design Canvas (#197).
// Run with: `node tests/audio-polish-processing.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");
const exportModel = require("../app/episode-export.js");
const review = require("../app/publish-review.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

function uploadEpisode() {
  const draft = setup.createDraft();
  draft.episodeName = "Indie Makers Weekly — Episode 3";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Jordan Lee", fileName: "jordan-synced.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Priya Shah", fileName: "priya-synced.mp4" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Chris Ortiz", fileName: "chris-synced.mp4" }),
  ];
  return setup.summarize(draft);
}

function riversideEpisode() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered — Episode 1";
  draft.riversideLink = "https://riverside.fm/studio/founders-ep1";
  draft.speakers.forEach((speaker, index) => {
    speaker.name = ["Sam Rivera", "Dana Kim", "Alex Chen"][index];
  });
  return setup.summarize(draft);
}

function applyPolish(episode, presetId) {
  let polish = audio.createPolish(episode);
  if (presetId) {
    polish = audio.applyPreset(polish, presetId);
  }
  const result = audio.runPolish(polish, episode);
  assert.strictEqual(result.ok, true, result.error || "runPolish failed");
  return result.polish;
}

test("runPolish saves polished asset references for each uploaded speaker track", () => {
  const episode = uploadEpisode();
  const polish = applyPolish(episode, "clean");
  assert.strictEqual(polish.status, "complete");
  assert.strictEqual(polish.speakers.length, 3);
  polish.speakers.forEach((track) => {
    assert.strictEqual(track.status, audio.TRACK_STATUS.COMPLETE);
    assert.ok(track.sourceAssetId.includes("raw-upload/"));
    assert.ok(track.polishedAssetId.startsWith("polished/"));
    assert.ok(track.polishedAssetLabel.includes(track.name));
  });
});

test("runPolish fails when an imported upload track has no source file", () => {
  const episode = uploadEpisode();
  episode.speakers[1].sourceLabel = "No file chosen";
  let polish = audio.createPolish(episode);
  const result = audio.runPolish(polish, episode);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.polish.status, "failed");
  assert.strictEqual(result.polish.speakers[1].status, audio.TRACK_STATUS.FAILED);
});

test("summarizePolish exposes completion, per-track status, and export audio line", () => {
  const episode = riversideEpisode();
  const summary = audio.summarizePolish(applyPolish(episode, "studio"));
  assert.strictEqual(summary.complete, true);
  assert.strictEqual(summary.tracks.length, 3);
  assert.ok(summary.polishedTrackLine.includes("3 polished audio tracks"));
  assert.ok(summary.exportAudioLine.includes("polished speaker tracks"));
});

test("ACCEPTANCE: export and publish review require processed polished audio", () => {
  const episode = uploadEpisode();
  const unprocessed = audio.summarizePolish(audio.createPolish(episode));
  const processed = audio.summarizePolish(applyPolish(episode, "natural"));
  const style = { presetName: "Studio Spotlight", layoutLabel: "Side by side", pacingLabel: "Balanced" };

  assert.strictEqual(exportModel.validateReadiness({ audioPolish: unprocessed, appliedStyle: style }).ok, false);
  assert.strictEqual(exportModel.validateReadiness({ audioPolish: processed, appliedStyle: style }).ok, true);

  const reviewDraft = review.createReview(episode, {
    audioPolish: processed,
    appliedStyle: style,
    contextApproved: true,
    hasCanvas: false,
    captionCount: 0,
  });
  const audioCheck = reviewDraft.checks.find((item) => item.id === "audio-ready");
  assert.ok(audioCheck);
  assert.ok(/polished audio tracks/i.test(audioCheck.message));
});

test("ACCEPTANCE: UI apply runs runPolish and persists audioPolish in session snapshot", () => {
  assert.ok(ui.includes("AP.runPolish(audioPolish, summary)"));
  assert.ok(ui.includes("audioPolish: audioPolish"));
  assert.ok(styles.includes("/* ---- Audio polish processing (#197) ---- */"));
  assert.ok(styles.includes(".audio-track-status-complete"));
});

console.log(`\naudio polish processing: ${passed} assertions passed`);

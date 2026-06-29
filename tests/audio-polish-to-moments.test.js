"use strict";

// Audio polish → visual moments handoff smoke suite (closes #269).
//
// Verifies that after applying audio polish the full production context —
// per-speaker polished tracks, episode name, and speaker identity — survives
// the transition into the visual moments editor so Step 4 opens with everything
// intact. Run with: `node tests/audio-polish-to-moments.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");
const moments = require("../app/visual-moments.js");
const flow = require("../app/episode-flow.js");

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
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal" }),
  ];
  draft.speakers.forEach((speaker, index) => {
    setup.attachSourceMediaAsset(speaker, {
      assetId: `source-media-${index + 1}`,
      fileName: ["sam.mp4", "dana.mp4", "marco.mp4"][index],
      fileSize: 4096,
      mimeType: "video/mp4",
      storage: "indexedDB",
    });
  });
  return draft;
}

test("visual moments is step 4 in the production workflow", () => {
  const indicator = flow.stepIndicatorForWorkspaceStage("moments");
  assert.strictEqual(indicator.step, 4);
  assert.strictEqual(indicator.labelText, "Visual moments");
  assert.ok(indicator.progress > 0.4 && indicator.progress <= 0.5, "moments at ~50% progress");
});

test("audio polish stays at step 3 after reordering", () => {
  const parsed = flow.parseStepLabel("Step 3 of 8 · Audio polish");
  assert.strictEqual(parsed.step, 3);
  assert.strictEqual(parsed.subtitle, "Audio polish");
  const indicator = flow.stepIndicatorForWorkspaceStage("audio");
  assert.strictEqual(indicator.step, 3);
});

test("applying audio polish produces per-speaker polished tracks", () => {
  const episode = setup.summarize(completeUploadDraft());
  const { applied, outcome } = audio.applyPolishForEpisode(episode);
  assert.strictEqual(outcome.complete, true);
  assert.strictEqual(applied.polishedTrackCount, 3);
  assert.strictEqual(applied.allTracksPolished, true);
  assert.strictEqual(applied.polishedTracks.length, 3);
  applied.polishedTracks.forEach((track) => {
    assert.strictEqual(track.status, "complete");
    assert.ok(track.polishedAsset && track.polishedAsset.assetId);
    assert.ok(track.metrics && typeof track.metrics.gainDb === "number");
  });
});

test("polished tracks carry speaker identity through to visual moments", () => {
  const draft = completeUploadDraft();
  const episode = setup.summarize(draft);
  const { applied } = audio.applyPolishForEpisode(episode);

  const tracks = applied.polishedTracks;
  assert.deepStrictEqual(tracks.map((t) => t.role), ["Host", "Guest 1", "Guest 2"]);
  assert.deepStrictEqual(tracks.map((t) => t.name), ["Sam Rivera", "Dana Kim", "Marco Vidal"]);

  const board = moments.createBoard(episode);
  assert.strictEqual(board.episodeName, "Founders Unfiltered #7");
  assert.strictEqual(board.transcript.length >= 4, true, "full episode scaffold");
  assert.strictEqual(board.transcript[0].speakerRole, "Host");
  assert.strictEqual(board.transcript[0].speakerName, "Sam Rivera");
  assert.strictEqual(board.transcript[1].speakerRole, "Guest 1");
});

test("all three speakers are available for moment placement after polish", () => {
  const episode = setup.summarize(completeUploadDraft());
  audio.applyPolishForEpisode(episode);

  const options = moments.speakerOptions(episode);
  assert.strictEqual(options.length, 4, "All speakers + 'All speakers' option");
  const roles = options.map((o) => o.role);
  assert.ok(roles.includes("Host"), "Host option present");
  assert.ok(roles.includes("Guest 1"), "Guest 1 option present");
  assert.ok(roles.includes("Guest 2"), "Guest 2 option present");
});

test("moments board survives a serialize round trip after polish handoff", () => {
  const episode = setup.summarize(completeUploadDraft());
  let board = moments.createBoard(episode);
  board = moments.addMoment(board, "caption", { time: "0:30", text: "Welcome to the show", speakerRole: "Host" });
  board = moments.addMoment(board, "callout", { time: "2:00", text: "Key insight", speakerRole: "Guest 1" });

  const restored = moments.deserializeBoard(moments.serializeBoard(board), episode);
  assert.strictEqual(moments.listMoments(restored).length, 2);
  assert.strictEqual(moments.listMoments(restored)[0].speakerRole, "Host");
  assert.strictEqual(moments.listMoments(restored)[1].speakerRole, "Guest 1");
});

test("ACCEPTANCE: episode polish → speaker tracks → moments board — full handoff", () => {
  const draft = completeUploadDraft();
  assert.strictEqual(setup.validateDraft(draft).ok, true);

  const episode = setup.summarize(draft);
  assert.strictEqual(episode.speakerCount, 3);

  const polish = audio.createPolish(episode);
  assert.strictEqual(polish.speakers.length, 3);

  const { applied, outcome } = audio.applyPolishForEpisode(episode, audio.applyPreset(polish, "studio"));
  assert.strictEqual(outcome.complete, true);
  assert.strictEqual(applied.presetName, "Studio");
  assert.strictEqual(applied.polishedTrackCount, 3);

  const board = moments.createBoard(episode);
  board.moments || assert.fail("board must initialise moments array");

  let b = moments.addMoment(board, "caption", { time: "0:20", text: "Intro" });
  b = moments.addMoment(b, "title", { time: "1:30", text: "Chapter one" });
  b = moments.addMoment(b, "broll", { time: "3:00", text: "Studio footage" });
  b = moments.addMoment(b, "callout", { time: "4:45", text: "Takeaway" });
  assert.strictEqual(moments.listMoments(b).length, 4);

  const preview = moments.previewMoment(b, moments.listMoments(b)[0].id);
  assert.ok(preview.effect.indexOf("0:20") >= 0);

  const indicator = flow.stepIndicatorForWorkspaceStage("moments");
  assert.strictEqual(indicator.step, 4, "moments is step 4 of 8");
  assert.strictEqual(indicator.countText, "Step 4 of 8");

  const summary = moments.summarizeBoard(b);
  assert.strictEqual(summary.total, 4);
  assert.strictEqual(summary.visibleCount, 4);
});

console.log(`\naudio polish → moments handoff: ${passed} assertions passed`);

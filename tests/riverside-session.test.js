"use strict";

// Riverside session track discovery smoke suite for Podcast Design Canvas (#225).
// Run with: `node tests/riverside-session.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const workspace = require("../app/episode-workspace.js");
const riverside = require("../app/riverside-session.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

const SAMPLE_LINK = "https://riverside.fm/studio/founders-ep1";
const DEMO_LINK = setup.sandboxDemoRiversideLink();

test("isRiversideUrl accepts riverside.fm studio links and rejects other hosts", () => {
  assert.strictEqual(riverside.isRiversideUrl(SAMPLE_LINK), true);
  assert.strictEqual(riverside.isRiversideUrl(DEMO_LINK), true);
  assert.strictEqual(riverside.isRiversideUrl("https://youtube.com/watch?v=1"), false);
  assert.strictEqual(riverside.isRiversideUrl("not-a-url"), false);
});

test("discoverSession rejects empty, malformed, and non-Riverside URLs", () => {
  const empty = riverside.discoverSession("");
  assert.strictEqual(empty.ok, false);
  assert.ok(/add your riverside/i.test(empty.error));

  const bad = riverside.discoverSession("my recording");
  assert.strictEqual(bad.ok, false);
  assert.ok(/doesn't look right/i.test(bad.error));

  const other = riverside.discoverSession("https://example.com/studio/session");
  assert.strictEqual(other.ok, false);
  assert.ok(/doesn't look like a riverside session/i.test(other.error));
});

test("discoverSession returns deterministic tracks with labels, durations, and sync status", () => {
  const result = riverside.discoverSession(SAMPLE_LINK);
  assert.strictEqual(result.ok, true);
  const session = result.session;
  assert.strictEqual(session.slug, "founders-ep1");
  assert.strictEqual(session.trackCount, 3);
  assert.strictEqual(session.tracks.length, 3);
  session.tracks.forEach((track) => {
    assert.ok(track.label);
    assert.ok(track.durationLabel);
    assert.ok(track.durationSeconds > 0);
    assert.strictEqual(track.synced, true);
  });
  assert.deepStrictEqual(
    session.tracks.map((track) => track.role),
    ["Host", "Guest 1", "Guest 2"],
  );

  const again = riverside.discoverSession(SAMPLE_LINK);
  assert.deepStrictEqual(again.session.tracks.map((track) => track.label), session.tracks.map((track) => track.label));
});

test("applyTracksToDraft maps tracks onto speaker buckets and preserves draft fields", () => {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered — Episode 1";
  draft.riversideLink = SAMPLE_LINK;
  draft.speakers[0].name = "Sam Rivera";
  draft.speakers[0].social.twitter = "https://x.com/samrivera";

  const discovered = riverside.discoverSession(SAMPLE_LINK);
  const next = riverside.applyTracksToDraft(draft, discovered.session);

  assert.strictEqual(next.episodeName, "Founders Unfiltered — Episode 1");
  assert.strictEqual(next.speakers.length, 3);
  assert.strictEqual(next.speakers[0].name, "Sam Rivera");
  assert.strictEqual(next.speakers[0].social.twitter, "https://x.com/samrivera");
  assert.strictEqual(next.speakers[0].role, "Host");
  assert.ok(next.speakers[0].trackLabel.includes("Founders Ep1"));
  assert.strictEqual(next.speakers[1].role, "Guest 1");
  assert.strictEqual(next.speakers[1].name, "Guest 1");
  assert.strictEqual(next.speakers[2].role, "Guest 2");
});

test("discovered tracks flow through setup handoff and workspace recap", () => {
  const draft = setup.createDraft();
  draft.episodeName = "Indie Makers — Episode 3";
  draft.riversideLink = "https://riverside.fm/studio/indie-makers-ep3";
  const discovered = riverside.discoverSession(draft.riversideLink);
  const applied = riverside.applyTracksToDraft(draft, discovered.session);
  const summary = setup.summarize(applied);
  const handoff = setup.buildImportHandoff(summary);

  assert.ok(handoff.speakers[0].sourceLabel.includes("Indie Makers Ep3"));
  assert.ok(handoff.speakers[1].sourceLabel.includes("Guest 1"));

  const ws = workspace.buildWorkspace(summary, { contextApproved: false });
  const setupStage = workspace.getStage(ws, "setup");
  assert.ok(setupStage.summary.includes("Indie Makers Ep3"));
  assert.ok(setupStage.summary.includes("Guest 1"));
});

test("sandbox demo Riverside link discovers tracks the same way", () => {
  const result = riverside.discoverSession(DEMO_LINK);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.session.slug, "podcast-canvas-demo");
  assert.strictEqual(result.session.tracks.length, 3);
});

test("UI wires discover tracks, preview list, and apply-to-buckets action (#225)", () => {
  assert.ok(ui.includes("PdcRiversideSession"));
  assert.ok(ui.includes("riverside-discover-btn"));
  assert.ok(ui.includes("Discover tracks"));
  assert.ok(ui.includes("riverside-apply-tracks-btn"));
  assert.ok(ui.includes("Apply to speaker buckets"));
  assert.ok(ui.includes("riverside-session-track-list"));
  assert.ok(styles.includes(".riverside-session-track-list"));
});

test("ACCEPTANCE: discover Riverside tracks → apply to buckets → handoff shows track names", () => {
  const draft = setup.createDraft();
  draft.riversideLink = SAMPLE_LINK;
  const discovered = riverside.discoverSession(draft.riversideLink);
  assert.strictEqual(discovered.ok, true);

  const applied = riverside.applyTracksToDraft(draft, discovered.session);
  const ready = setup.applyImportContinueDefaults(applied, { showName: "Founders Unfiltered" });
  const validation = setup.validateDraft(ready);
  assert.strictEqual(validation.ok, true, JSON.stringify(validation.errors));

  const summary = setup.summarize(ready);
  const completion = setup.buildSetupCompletionHandoff(summary, { presetSummary: "Split Stage" });
  assert.ok(completion.handoff.speakers[0].sourceLabel.includes("Founders Ep1 — Host track"));
  assert.ok(completion.handoff.speakers[1].sourceLabel.includes("Guest 1 track"));
  assert.ok(riverside.summarizeSession(discovered.session).reviewLine.includes("3 Riverside tracks"));
});

console.log(`\nriverside session: ${passed} assertions passed`);

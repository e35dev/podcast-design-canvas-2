"use strict";

// Audio-polish → visual-moments handoff smoke suite for Podcast Design Canvas (#269).
// Run with: `node tests/audio-polish-handoff.test.js`.
//
// Covers the two halves of the fix: the polished-track recap that the visual
// moments step shows so the polished outputs stay accessible, and the workspace
// stage order that proves "continue" after audio leads into visual moments
// (not back to a dead-end hub).

const assert = require("assert");
const AP = require("../app/audio-polish.js");
const workspace = require("../app/episode-workspace.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function polishedSummary() {
  return {
    presetName: "Studio clarity",
    treatmentLine: "Noise: Strong · Leveling: Balanced",
    polishedTracks: [
      {
        trackIndex: 1,
        role: "Host",
        name: "Ada Lovelace",
        status: "complete",
        polishedAsset: { fileName: "host.wav", assetId: "asset-1", byteLength: 2048 },
        metrics: { gainDb: 2, inputRms: 0.11, outputRms: 0.2, inputPeak: 0.5, outputPeak: 0.8 },
      },
      {
        trackIndex: 2,
        role: "Guest 1",
        name: "Grace Hopper",
        status: "complete",
        polishedAsset: { fileName: "guest.wav", assetId: "asset-2", byteLength: 4096 },
        metrics: { gainDb: -1, inputRms: 0.3, outputRms: 0.25 },
      },
      // A failed track must never appear in the recap.
      { trackIndex: 3, role: "Guest 2", name: "Skipped", status: "failed" },
    ],
  };
}

test("buildPolishedRecap surfaces every completed track with speaker + treatment + file", () => {
  const recap = AP.buildPolishedRecap(polishedSummary());
  assert.strictEqual(recap.count, 2); // the failed track is excluded
  assert.strictEqual(recap.presetName, "Studio clarity");
  assert.strictEqual(recap.treatmentLine, "Noise: Strong · Leveling: Balanced");
  assert.deepStrictEqual(
    recap.tracks.map((t) => t.name),
    ["Ada Lovelace", "Grace Hopper"],
  );
  const host = recap.tracks[0];
  assert.strictEqual(host.role, "Host");
  assert.strictEqual(host.fileName, "host.wav");
  assert.strictEqual(host.assetId, "asset-1");
  assert.strictEqual(host.byteLength, 2048);
  assert.strictEqual(host.metricLine, "Level +2 dB · RMS 0.11 → 0.2"); // positive gain prefixed with +
  assert.strictEqual(recap.tracks[1].metricLine, "Level -1 dB · RMS 0.3 → 0.25");
});

test("buildPolishedRecap is schema-stable on empty / junk / missing input", () => {
  for (const input of [undefined, null, {}, { polishedTracks: null }, { polishedTracks: [{ status: "failed" }] }]) {
    const recap = AP.buildPolishedRecap(input);
    assert.strictEqual(recap.count, 0);
    assert.deepStrictEqual(recap.tracks, []);
    assert.strictEqual(recap.presetName, null);
  }
});

test("a track missing metrics still lists, with a null metric line (never throws)", () => {
  const recap = AP.buildPolishedRecap({
    polishedTracks: [
      { trackIndex: 1, role: "Host", name: "Ada", status: "complete", polishedAsset: { fileName: "h.wav" } },
    ],
  });
  assert.strictEqual(recap.count, 1);
  assert.strictEqual(recap.tracks[0].metricLine, null);
  assert.strictEqual(recap.tracks[0].fileName, "h.wav");
});

test("ACCEPTANCE: the production flow continues from audio polish into visual moments", () => {
  // The post-apply "Continue to visual moments" action targets the "moments"
  // stage; that target must be the real next production stage after audio, not a
  // hub dead-end. The workspace stage order is the source of truth for that path.
  const order = workspace.STAGE_ORDER;
  const audioIdx = order.indexOf("audio");
  const momentsIdx = order.indexOf("moments");
  assert.ok(audioIdx >= 0, "audio is a production stage");
  assert.ok(momentsIdx >= 0, "visual moments is a production stage");
  assert.ok(momentsIdx > audioIdx, "visual moments comes after audio polish");
  assert.strictEqual(workspace.ACTION_TARGETS.moments, "moments");
});

console.log(`\naudio polish handoff: ${passed} assertions passed`);

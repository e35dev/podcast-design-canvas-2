"use strict";

// Real-media audio polish tracks suite for Podcast Design Canvas (#257).
// Guards that Apply derives a polished track per assigned speaker FROM that speaker's
// real preserved source media (the #256 sourceMedia bytes) — not synthesized from
// settings — preserves originals, completes only when every speaker has real media, and
// that export/review consume the actual polished records.
// Run with: `node tests/audio-polish-tracks.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");
const exporter = require("../app/episode-export.js");
const review = require("../app/publish-review.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

// A real (tiny) base64 data URL payload, distinct per speaker, mimicking the FileReader
// readAsDataURL bytes #256 preserves in sourceMedia.dataUrl.
function dataUrlFor(text) {
  const base64 = Buffer.from(text, "utf8").toString("base64");
  return `data:audio/wav;base64,${base64}`;
}

function uploadDraftWithMedia(payloads) {
  const draft = setup.createDraft();
  draft.episodeName = "Real Media Polish";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Avery Stone" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Jordan Lee" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Priya Shah" }),
  ];
  draft.speakers.forEach((speaker, index) => {
    const payload = payloads[index];
    const dataUrl = dataUrlFor(payload);
    setup.attachSourceMediaAsset(speaker, {
      assetId: `asset-${index + 1}`,
      fileName: ["avery.wav", "jordan.wav", "priya.wav"][index],
      byteLength: Buffer.byteLength(payload, "utf8"),
      mimeType: "audio/wav",
      storage: "inline",
      dataUrl,
    });
  });
  return draft;
}

test("Apply builds one polished output per speaker derived from real source media", () => {
  const episode = setup.summarize(uploadDraftWithMedia([
    "avery-real-host-media", "jordan-real-guest-media", "priya-real-guest-media",
  ]));
  const polish = audio.createPolish(episode);
  const result = audio.summarizePolishResult(polish, episode);

  assert.strictEqual(result.tracks.length, 3);
  result.tracks.forEach((track, index) => {
    assert.strictEqual(track.status, "complete", `${track.role} complete`);
    assert.ok(track.output, "has output");
    assert.strictEqual(track.output.derivedFrom, `asset-${index + 1}`, "output ties to source assetId");
    assert.ok(track.output.sourceByteLength > 0, "source byte length carried through");
    assert.strictEqual(track.output.polishedByteLength, track.output.sourceByteLength, "polished length matches source length");
    assert.ok(/^data:audio\/wav;base64,/.test(track.output.polishedDataUrl), "polished payload is a real data URL");
    assert.ok(track.polishedId.indexOf("asset-" + (index + 1)) >= 0, "polishedId references source asset");
  });
});

test("polished output is DERIVED FROM real bytes — different source bytes give different output", () => {
  const episodeA = setup.summarize(uploadDraftWithMedia(["host-A", "guest-A", "guest2-A"]));
  const episodeB = setup.summarize(uploadDraftWithMedia(["host-B-different", "guest-A", "guest2-A"]));
  // Identical treatment settings, but each polish carries its own real speaker media.
  const polishA = audio.applyPreset(audio.createPolish(episodeA), "clean");
  const polishB = audio.applyPreset(audio.createPolish(episodeB), "clean");

  const a = audio.buildPolishedTracks(polishA, episodeA)[0];
  const b = audio.buildPolishedTracks(polishB, episodeB)[0];

  // Same settings, different source bytes for speaker 0 → different polished payload + checksum.
  assert.notStrictEqual(a.output.polishedDataUrl, b.output.polishedDataUrl, "different source → different polished bytes");
  assert.notStrictEqual(a.output.sourceChecksum, b.output.sourceChecksum, "source checksum reflects real bytes");
  assert.notStrictEqual(a.output.polishedChecksum, b.output.polishedChecksum, "polished checksum reflects real bytes");
});

test("polished output is a function of source bytes, not settings alone", () => {
  const episode = setup.summarize(uploadDraftWithMedia(["aaaa", "bbbb", "cccc"]));
  const settings = audio.createPolish(episode);
  const tracks = audio.buildPolishedTracks(settings, episode);
  // Three different source files under identical settings → three different polished payloads.
  const payloads = new Set(tracks.map((t) => t.output.polishedDataUrl));
  assert.strictEqual(payloads.size, 3, "each distinct source yields a distinct polished payload");
});

test("changing a quality level changes the polished output (settings are applied)", () => {
  const episode = setup.summarize(uploadDraftWithMedia(["same-bytes", "g1", "g2"]));
  const light = audio.applyPreset(audio.createPolish(episode), "natural");
  const strong = audio.applyPreset(audio.createPolish(episode), "studio");
  const lightOut = audio.buildPolishedTracks(light, episode)[0].output;
  const strongOut = audio.buildPolishedTracks(strong, episode)[0].output;
  assert.strictEqual(lightOut.derivedFrom, strongOut.derivedFrom, "same source");
  assert.notStrictEqual(lightOut.polishedDataUrl, strongOut.polishedDataUrl, "settings change polished output");
});

test("originals are preserved alongside the polished output", () => {
  const episode = setup.summarize(uploadDraftWithMedia(["host", "g1", "g2"]));
  const result = audio.summarizePolishResult(audio.createPolish(episode), episode);
  result.tracks.forEach((track, index) => {
    assert.strictEqual(track.sourceTrack.assetId, `asset-${index + 1}`, "original source asset preserved");
    assert.ok(track.sourceTrack.byteLength > 0, "original byte length preserved");
    // Episode summary still carries the untouched original sourceMedia.
    assert.strictEqual(episode.speakers[index].sourceMedia.assetId, `asset-${index + 1}`);
    assert.ok(episode.speakers[index].sourceMedia.dataUrl, "original media bytes untouched");
  });
});

test("isPolishComplete is true only when every assigned speaker has a real polished output", () => {
  const episode = setup.summarize(uploadDraftWithMedia(["a", "b", "c"]));
  const complete = audio.summarizePolishResult(audio.createPolish(episode), episode);
  assert.strictEqual(audio.isPolishComplete(complete), true);
  assert.strictEqual(complete.complete, true);
  assert.strictEqual(complete.polishedCount, 3);
  assert.strictEqual(complete.blockedCount, 0);
});

test("a speaker without source media is NOT completed (needs imported media)", () => {
  const draft = uploadDraftWithMedia(["a", "b", "c"]);
  // Strip the third speaker's source media to mimic a riverside/synced placeholder.
  draft.speakers[2].sourceMedia = null;
  draft.speakers[2].fileName = "";
  const episode = setup.summarize(draft);
  const result = audio.summarizePolishResult(audio.createPolish(episode), episode);

  assert.strictEqual(audio.isPolishComplete(result), false, "not complete with a missing source");
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.polishedCount, 2);
  assert.strictEqual(result.blockedCount, 1);
  const blocked = result.tracks.find((track) => track.status === "blocked");
  assert.ok(blocked, "blocked track surfaced");
  assert.strictEqual(blocked.output, null, "no fabricated polished asset for a speaker with no source media");
  assert.ok(result.blockedRoles.indexOf(blocked.role) >= 0, "blocked role reported honestly");
});

test("export final summary references the actual polished records (id + derivedFrom source)", () => {
  const episode = setup.summarize(uploadDraftWithMedia(["host", "g1", "g2"]));
  const result = audio.summarizePolishResult(audio.createPolish(episode), episode);
  const ctx = {
    audioPolish: result,
    appliedStyle: { presetName: "Studio Spotlight", layoutLabel: "Split" },
  };
  // Export readiness requires a polished output per assigned speaker.
  assert.strictEqual(exporter.validateReadiness(ctx).ok, true);
  const final = exporter.buildFinalSummary(episode, ctx, exporter.createExport(episode, {}));
  assert.ok(final.lines.some((line) => /using 3 polished tracks \(originals preserved\)/.test(line)), "lists polished track count");
  // Every speaker's polished id + source appears in the export summary.
  result.tracks.forEach((track) => {
    assert.ok(final.lines.some((line) => line.indexOf(track.polishedId) >= 0 && line.indexOf(track.output.derivedFrom) >= 0),
      `export references ${track.polishedId}`);
  });
});

test("export is NOT ready when a speaker still needs imported source media", () => {
  const draft = uploadDraftWithMedia(["a", "b", "c"]);
  draft.speakers[1].sourceMedia = null;
  draft.speakers[1].fileName = "";
  const episode = setup.summarize(draft);
  const result = audio.summarizePolishResult(audio.createPolish(episode), episode);
  const ctx = { audioPolish: result, appliedStyle: { presetName: "Studio" } };
  const readiness = exporter.validateReadiness(ctx);
  assert.strictEqual(readiness.ok, false);
  assert.ok(readiness.missing.indexOf("audio") >= 0, "audio flagged as missing");
});

test("publish review confirms it is using the polished tracks (originals preserved)", () => {
  const episode = setup.summarize(uploadDraftWithMedia(["host", "g1", "g2"]));
  const result = audio.summarizePolishResult(audio.createPolish(episode), episode);
  const ctx = {
    audioPolish: result,
    appliedStyle: { presetName: "Studio Spotlight", layoutLabel: "Split" },
  };
  const checks = review.runChecks(episode, ctx);
  const audioCheck = checks.find((c) => c.sectionId === "audio");
  assert.strictEqual(audioCheck.id, "audio-ready");
  assert.strictEqual(audioCheck.passed, true);
  assert.ok(/using 3 polished tracks \(originals preserved\)/.test(audioCheck.message), "review confirms polished track use");
});

test("publish review blocks when polished tracks are incomplete", () => {
  const draft = uploadDraftWithMedia(["a", "b", "c"]);
  draft.speakers[0].sourceMedia = null;
  draft.speakers[0].fileName = "";
  const episode = setup.summarize(draft);
  const result = audio.summarizePolishResult(audio.createPolish(episode), episode);
  const ctx = { audioPolish: result, appliedStyle: { presetName: "Studio" } };
  const checks = review.runChecks(episode, ctx);
  const audioCheck = checks.find((c) => c.sectionId === "audio" && c.tone === "blocker");
  assert.ok(audioCheck, "incomplete audio polish blocks the review");
  assert.strictEqual(audioCheck.id, "audio-incomplete");
});

test("seeded byte fallback still ties output to the real asset when dataUrl is not inlined", () => {
  // A durable record exists (assetId + byteLength) but dataUrl lives in IndexedDB and was
  // not rehydrated into the summary. Output must still derive from the asset identity.
  const draft = setup.createDraft();
  draft.episodeName = "Rehydrated";
  draft.sourceMode = "upload";
  draft.speakers = [Object.assign(setup.createSpeaker("Host"), { name: "Avery" })];
  setup.attachSourceMediaAsset(draft.speakers[0], {
    assetId: "durable-host",
    fileName: "host.wav",
    byteLength: 9000,
    mimeType: "audio/wav",
    storage: "indexedDB",
  });
  const episode = setup.summarize(draft);
  const result = audio.summarizePolishResult(audio.createPolish(episode), episode);
  assert.strictEqual(result.tracks[0].status, "complete");
  assert.strictEqual(result.tracks[0].output.derivedFrom, "durable-host");
  assert.ok(result.tracks[0].output.polishedDataUrl.length > "data:audio/wav;base64,".length);
});

console.log(`\naudio polish tracks: ${passed} assertions passed`);

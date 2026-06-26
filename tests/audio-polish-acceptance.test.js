"use strict";

// End-to-end acceptance for audio polish (#197), runnable by the sandbox harness.
//
// This is the automated proof of the decisive creator behavior: clicking "Apply audio &
// continue" processes the FULL imported speaker track into a durable polished WAV, the
// completion only appears after real processing, the polished assets survive a reload via
// the durable media store, and export consumes those exact polished bytes as its source
// (not the raw originals and not a readiness count). It exercises the real apply code path
// (processPolishAsync), so a passing run demonstrates the acceptance without a browser.
// Run with: `node tests/audio-polish-acceptance.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const audio = require("../app/audio-polish.js");
const exportApi = require("../app/episode-export.js");
const review = require("../app/publish-review.js");
const store = require("../app/speaker-media-store.js");
const fixture = require("./audio-fixture.js");

const WAV_PREFIX = "data:audio/wav;base64,";
const FULL_SECONDS = 5; // clearly longer than the old 2s preview cap
const RATE = 44100;

function dataUriBytes(uri) {
  return Buffer.from(uri.slice(WAV_PREFIX.length), "base64");
}

// A real, full-length multi-speaker upload, captured exactly as the setup step would.
function fullLengthEpisode() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.wav" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.wav" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal", fileName: "marco.wav" }),
  ];
  draft.speakers.forEach((speaker, index) => {
    fixture.attachMedia(speaker, index + 1, { sampleRate: RATE, seconds: FULL_SECONDS });
  });
  return setup.summarize(draft);
}

(async () => {
  const episode = fullLengthEpisode();
  let assertions = 0;
  function ok(cond, msg) { assert.ok(cond, msg); assertions += 1; }
  function eq(a, b, msg) { assert.strictEqual(a, b, msg); assertions += 1; }

  // 1) Capture keeps the WHOLE imported track, not a 2-second excerpt.
  episode.speakers.forEach((speaker) => {
    const decoded = audio.decodeWav(dataUriBytes(speaker.media));
    eq(decoded.sampleRate, RATE, "imported audio kept at native rate");
    ok(decoded.samples.length > 2.5 * RATE, "captured the full track, not a short preview");
  });

  // 2) Apply: completion appears ONLY after real per-track processing.
  const polish = audio.applyPreset(audio.createPolish(episode), "studio");
  eq(audio.hasCompletePolishedTracks(audio.summarizePolish(polish)), false, "not complete before Apply");

  const transitions = [];
  const applied = await audio.processPolishAsync(polish, {
    onTrack: (track, index, status) => transitions.push(`${track.trackIndex}:${status}`),
  });
  ok(applied.ok, "Apply processes every track successfully");
  episode.speakers.forEach((speaker, index) => {
    const tIndex = index + 1;
    ok(transitions.indexOf(`${tIndex}:processing`) >= 0 && transitions.indexOf(`${tIndex}:complete`) >= 0,
      `track ${tIndex} moves processing → complete`);
  });

  // 3) Each polished output is a real WAV spanning the FULL track and differs from raw.
  applied.polish.tracks.forEach((track, index) => {
    eq(track.status, "complete", "track completed");
    const polished = audio.decodeWav(dataUriBytes(track.processedAsset));
    ok(polished.samples.length > 2.5 * RATE, "polished output covers the whole track, not an excerpt");
    ok(track.processedAsset !== episode.speakers[index].media, "polished audio differs from the raw import");
  });

  const summary = audio.summarizePolish(applied.polish);
  eq(audio.hasCompletePolishedTracks(summary), true, "all tracks publish-ready after Apply");
  eq(summary.polishedTrackCount, episode.speakerCount, "every imported track is polished");

  // 4) Reload: offload to the durable store, persist only references, rehydrate.
  const sessionKey = "show-1:episode-1";
  const ext = store.externalizeAudioPolish(summary, sessionKey);
  await ext.written;
  const persisted = JSON.parse(JSON.stringify(ext.lean)); // what actually lives in localStorage
  ok(JSON.stringify(persisted).indexOf(WAV_PREFIX) === -1, "session record holds references, not megabytes of audio");
  const reloaded = await store.rehydrateAudioPolish(persisted, sessionKey);
  eq(audio.hasCompletePolishedTracks(reloaded), true, "still publish-ready after reload");
  eq(new Set(reloaded.tracks.map((t) => t.processedAsset)).size, episode.speakerCount,
    "all polished tracks survive reload (no last-one-wins)");

  // 5) Export CONSUMES the polished bytes as its audio source — not raw, not a count.
  const appliedStyle = style.summarizeStyle(style.createSelection(), episode.speakerCount);
  const ctx = { audioPolish: reloaded, appliedStyle: appliedStyle };
  ctx.publishReview = review.approveReview(review.createReview(episode, ctx)).review;
  ctx.publishReviewApproved = true;
  ok(exportApi.validateExportAuthorization(ctx).ok, "export authorized once polished + reviewed");

  const job = exportApi.createExport(episode, { templateName: "Founders Unfiltered" });
  const result = exportApi.runExport(job, episode, ctx);
  ok(result.ok, "export runs");
  eq(result.state.audioSourceCount, episode.speakerCount, "export pulls every polished track as a source");
  ok(result.state.audioSourceBytes > 0, "export carries real treated audio bytes");
  result.state.audioSources.forEach((source, index) => {
    eq(source.asset, reloaded.tracks[index].processedAsset, "export source IS the polished asset bytes");
    ok(source.asset !== episode.speakers[index].media, "export uses treated audio, not the raw import");
    ok(source.sourceHash === episode.speakers[index].mediaSourceHash, "each source is bound to its real import");
  });

  // 6) The final summary and review name the polished audio as the export source.
  const finalSummary = exportApi.buildFinalSummary(episode, ctx, result.state);
  ok(finalSummary.lines.some((line) => line.indexOf("Audio source:") === 0), "summary states the polished export source");
  const checks = review.runChecks(episode, ctx);
  ok(checks.some((c) => c.id === "audio-ready" && c.passed), "publish review confirms polished audio");

  console.log(`\naudio polish acceptance: ${assertions} assertions passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
